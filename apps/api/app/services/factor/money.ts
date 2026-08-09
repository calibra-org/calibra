export interface FactorLineMoneyInput {
    quantity: number;
    unitPriceMinor: number;
    discountPercent?: number;
}

export interface FactorLineMoneyResult {
    grossMinor: number;
    discountMinor: number;
    netMinor: number;
    allocatedOrderDiscountMinor: number;
    taxableMinor: number;
    taxMinor: number;
    totalMinor: number;
}

export interface FactorMoneyResult {
    lines: FactorLineMoneyResult[];
    subtotalMinor: number;
    lineDiscountMinor: number;
    orderDiscountMinor: number;
    shippingMinor: number;
    shippingTaxMinor: number;
    taxMinor: number;
    roundingMinor: number;
    payableMinor: number;
}

function assertSafeNonNegativeInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${field} must be a safe non-negative integer`);
    }
    return value;
}

function clampPercent(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
}

/** Allocate an integer total proportionally while preserving the exact requested sum. */
function allocateProRata(total: number, weights: readonly number[]): number[] {
    assertSafeNonNegativeInteger(total, "allocation total");
    const safeWeights = weights.map((weight, index) => assertSafeNonNegativeInteger(weight, `allocation weight ${index}`));
    const weightSum = safeWeights.reduce((sum, value) => sum + value, 0);
    if (total === 0 || weightSum === 0) return safeWeights.map(() => 0);

    const raw = safeWeights.map((weight) => (total * weight) / weightSum);
    const allocated = raw.map((value) => Math.floor(value));
    let remainder = total - allocated.reduce((sum, value) => sum + value, 0);
    const order = raw
        .map((value, index) => ({ index, fraction: value - allocated[index]! }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (let cursor = 0; remainder > 0; cursor += 1, remainder -= 1) {
        allocated[order[cursor % order.length]!.index]! += 1;
    }
    return allocated;
}

/**
 * Canonical factor calculator.
 *
 * Money values are integer tenant-currency minor units. The calculator also allocates the document-level
 * discount and tax to order lines so the backing Calibra order can be recalculated without
 * double-counting discounts or losing tax.
 */
export function calculateFactorMoney(
    inputLines: readonly FactorLineMoneyInput[],
    options: {
        orderDiscountMinor?: number;
        shippingMinor?: number;
        taxPercent?: number;
        roundToMinor?: number;
    } = {},
): FactorMoneyResult {
    const baseLines = inputLines.map((line, index) => {
        const quantity = assertSafeNonNegativeInteger(line.quantity, `quantity ${index}`);
        if (quantity === 0) throw new RangeError("quantity must be greater than zero");
        const unitPriceMinor = assertSafeNonNegativeInteger(line.unitPriceMinor, `unitPriceMinor ${index}`);
        const grossMinor = quantity * unitPriceMinor;
        if (!Number.isSafeInteger(grossMinor)) throw new RangeError("line gross exceeds safe integer range");
        const discountMinor = Math.round((grossMinor * clampPercent(line.discountPercent)) / 100);
        return { grossMinor, discountMinor, netMinor: grossMinor - discountMinor };
    });

    const subtotalMinor = baseLines.reduce((sum, line) => sum + line.grossMinor, 0);
    const lineDiscountMinor = baseLines.reduce((sum, line) => sum + line.discountMinor, 0);
    const netItemsMinor = subtotalMinor - lineDiscountMinor;
    const orderDiscountMinor = Math.min(
        assertSafeNonNegativeInteger(options.orderDiscountMinor ?? 0, "orderDiscountMinor"),
        Math.max(0, netItemsMinor),
    );
    const shippingMinor = assertSafeNonNegativeInteger(options.shippingMinor ?? 0, "shippingMinor");
    const allocatedOrderDiscounts = allocateProRata(
        orderDiscountMinor,
        baseLines.map((line) => line.netMinor),
    );
    const lineTaxable = baseLines.map((line, index) => Math.max(0, line.netMinor - allocatedOrderDiscounts[index]!));
    const taxableMinor = lineTaxable.reduce((sum, value) => sum + value, 0) + shippingMinor;
    const taxMinor = Math.round((taxableMinor * clampPercent(options.taxPercent)) / 100);
    const allocatedTaxes = allocateProRata(taxMinor, [...lineTaxable, shippingMinor]);
    const shippingTaxMinor = allocatedTaxes.at(-1) ?? 0;

    const lines: FactorLineMoneyResult[] = baseLines.map((line, index) => ({
        ...line,
        allocatedOrderDiscountMinor: allocatedOrderDiscounts[index]!,
        taxableMinor: lineTaxable[index]!,
        taxMinor: allocatedTaxes[index]!,
        totalMinor: lineTaxable[index]! + allocatedTaxes[index]!,
    }));

    const beforeRounding = taxableMinor + taxMinor;
    const roundToMinor = Math.max(1, assertSafeNonNegativeInteger(options.roundToMinor ?? 1, "roundToMinor"));
    const payableMinor = Math.round(beforeRounding / roundToMinor) * roundToMinor;
    const roundingMinor = payableMinor - beforeRounding;

    for (const value of [
        subtotalMinor,
        lineDiscountMinor,
        orderDiscountMinor,
        shippingMinor,
        shippingTaxMinor,
        taxMinor,
        payableMinor,
    ]) {
        if (!Number.isSafeInteger(value)) throw new RangeError("factor total exceeds safe integer range");
    }

    return {
        lines,
        subtotalMinor,
        lineDiscountMinor,
        orderDiscountMinor,
        shippingMinor,
        shippingTaxMinor,
        taxMinor,
        roundingMinor,
        payableMinor,
    };
}
