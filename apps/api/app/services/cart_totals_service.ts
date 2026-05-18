import type {
    Discounter,
    DiscounterCouponContext,
    DiscounterCustomerContext,
    DiscounterItem,
    DiscounterResult,
} from "#contracts/discounter";
import type { ShippingRateOption } from "#services/shipping_rate_service";
import { calculateTax, fetchRates, type TaxAddress, type TaxRateInput } from "#services/tax_calculator";

/**
 * Item descriptor for the pure {@link calculateCartTotals} math. Decoupled from the Lucid `CartItem`
 * model so unit tests can construct plain objects without ever touching the DB.
 */
export interface CartTotalsItem {
    /** Stable key — the Lucid line `id` cast to string, used by the discounter to address lines. */
    lineKey: string;
    /** Echoed back on output so the transformer can resolve the original cart_item.id. */
    id?: number;
    productId: number;
    variationId: number | null;
    quantity: number;
    /** Gross price-per-unit snapshot (incl. VAT when `pricesIncludeTax = true`). */
    priceSnapshot: number;
    /** `tax_classes.id` — `null` means the line is non-taxable regardless of address. */
    taxClassId: number | null;
    /** `taxable | shipping | none` mirrored from `products.tax_status`. */
    taxStatus: "taxable" | "shipping" | "none";
    /** False when the product is virtual / downloadable; drives `needs_shipping`. */
    requiresShipping: boolean;
    /** Optional category ids — passed through to the discounter only. */
    categoryIds?: number[];
    /** Optional tag ids — passed through to the discounter only. */
    tagIds?: number[];
    /** True when the snapshot price reflects an active sale — passed through to the discounter. */
    onSale?: boolean;
}

export interface CartLineTotals {
    id?: number;
    productId: number;
    variationId: number | null;
    quantity: number;
    priceSnapshot: number;
    /** Pre-discount line base (tax-exclusive amount); equals quantity × priceSnapshot for exclusive carts. */
    subtotal: number;
    /** Pre-discount tax portion (extracted from gross for inclusive carts, computed on top for exclusive). */
    subtotalTax: number;
    /** Post-discount line base. Equals subtotal when no discount applies. */
    total: number;
    /** Tax on post-discount base — recomputed because the discount changes the taxable amount. */
    totalTax: number;
}

export interface CartTotalsResult {
    lines: CartLineTotals[];
    itemsTotal: number;
    itemsTaxTotal: number;
    shippingTotal: number;
    shippingTaxTotal: number;
    discountTotal: number;
    discountTaxTotal: number;
    taxTotal: number;
    grandTotal: number;
    needsShipping: boolean;
    needsPayment: boolean;
}

/**
 * Synchronous tax-rate provider: given a `tax_classes.id`, returns the ordered rate stack that
 * applies to the cart's address. The orchestrator pre-fetches and passes a closure; unit tests
 * pass a hand-built map.
 */
export type CartTaxRateProvider = (taxClassId: number) => ReadonlyArray<TaxRateInput>;

export interface CartTotalsInput {
    items: CartTotalsItem[];
    address: TaxAddress | null;
    selectedRateId: number | null;
    /**
     * Phase-04 wiring point. {@link Discounter.calculate} runs at the start of the pipeline; the
     * returned {@link DiscounterResult} is then folded into per-line and shipping totals.
     */
    discounterResult: DiscounterResult;
    pricesIncludeTax: boolean;
    /** Provider returning the rate stack for a given `tax_classes.id`. */
    rateProvider: CartTaxRateProvider;
    /** Carrier options the storefront can pick from — `selectedRateId` indexes into this. */
    shippingOptions: ShippingRateOption[];
    /** Tax-rate stack that fires on the shipping line (i.e. `applies_to_shipping = true`). */
    shippingTaxRates: ReadonlyArray<TaxRateInput>;
}

/**
 * Pure cart-totals math. No DB, no clock, no request context — every dependency arrives in
 * `input`. Tests construct synthetic inputs and assert on outputs; the orchestrator
 * (`computeCartTotals` below) handles the DB plumbing.
 *
 * The pipeline matches ADR §"Shipping/tax/coupon math":
 * 1. Discount (already computed in `discounterResult`)
 * 2. Items → tax (extracted from gross when `pricesIncludeTax`, computed on top otherwise)
 * 3. Shipping (selected rate from `shippingOptions`; free_shipping coupon overrides to 0)
 * 4. Shipping tax (only when carrier line is `taxable` and at least one `applies_to_shipping=true` rate exists)
 * 5. Grand total
 */
export function calculateCartTotals(input: CartTotalsInput): CartTotalsResult {
    const lines: CartLineTotals[] = [];

    for (const item of input.items) {
        const grossLine = item.priceSnapshot * item.quantity;
        const rates =
            item.taxStatus === "taxable" && item.taxClassId !== null && input.address ? input.rateProvider(item.taxClassId) : [];

        const subtotalCalc = calculateTax(grossLine, rates, { pricesIncludeTax: input.pricesIncludeTax });
        const subtotal = input.pricesIncludeTax ? subtotalCalc.base : grossLine;
        const subtotalTax = subtotalCalc.tax;

        const lineDiscount = input.discounterResult.perLineDiscounts.get(item.lineKey) ?? 0;
        let total = subtotal;
        let totalTax = subtotalTax;
        if (lineDiscount > 0) {
            const postDiscountGross = Math.max(grossLine - lineDiscount, 0);
            const postCalc = calculateTax(postDiscountGross, rates, { pricesIncludeTax: input.pricesIncludeTax });
            total = input.pricesIncludeTax ? postCalc.base : postDiscountGross;
            totalTax = postCalc.tax;
        }

        lines.push({
            id: item.id,
            productId: item.productId,
            variationId: item.variationId,
            quantity: item.quantity,
            priceSnapshot: item.priceSnapshot,
            subtotal,
            subtotalTax,
            total,
            totalTax,
        });
    }

    const itemsTotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const itemsTaxTotal = lines.reduce((sum, line) => sum + line.subtotalTax, 0);
    const lineTaxesAfterDiscount = lines.reduce((sum, line) => sum + line.totalTax, 0);

    let shippingTotal = 0;
    let shippingTaxTotal = 0;
    const selectedOption =
        input.selectedRateId === null
            ? null
            : (input.shippingOptions.find((option) => option.id === input.selectedRateId) ?? null);

    if (selectedOption) {
        const baseCost = input.discounterResult.freeShipping ? 0 : selectedOption.cost;
        const shippingCalc =
            baseCost > 0 && selectedOption.taxable && input.shippingTaxRates.length > 0
                ? calculateTax(baseCost, input.shippingTaxRates, { pricesIncludeTax: input.pricesIncludeTax })
                : { tax: 0, base: baseCost, breakdown: [] };
        shippingTotal = input.pricesIncludeTax ? shippingCalc.base : baseCost;
        shippingTaxTotal = shippingCalc.tax;
    }

    const taxTotal = lineTaxesAfterDiscount + shippingTaxTotal;
    const grandTotal =
        itemsTotal + shippingTotal + taxTotal - input.discounterResult.discountTotal - input.discounterResult.discountTaxTotal;

    const needsShipping = input.items.some((item) => item.requiresShipping);
    const needsPayment = grandTotal > 0;

    return {
        lines,
        itemsTotal,
        itemsTaxTotal,
        shippingTotal,
        shippingTaxTotal,
        discountTotal: input.discounterResult.discountTotal,
        discountTaxTotal: input.discounterResult.discountTaxTotal,
        taxTotal,
        grandTotal,
        needsShipping,
        needsPayment,
    };
}

/**
 * DB-backed orchestrator. Reads the tax rates per item's tax class once (memoized per call), then
 * delegates to {@link calculateCartTotals}. Designed to be called from the cart controller — every
 * cart-affecting request runs it and the resulting `CartTotalsResult` is folded into the response.
 *
 * `shippingOptions` and `shippingTaxRates` are passed in by the caller because they're already
 * loaded for the response envelope (the storefront sees the rates the customer can pick from);
 * computing them here would double-fetch.
 */
export async function computeCartTotals(args: {
    items: CartTotalsItem[];
    address: TaxAddress | null;
    selectedRateId: number | null;
    discounter: Discounter;
    pricesIncludeTax: boolean;
    shippingOptions: ShippingRateOption[];
    /**
     * Coupons the customer has on the cart. Phase 04 left this empty; phase 06's controller passes
     * the loaded `cart_applied_coupons` rows so the engine can re-evaluate eligibility on every
     * recomputation (a newly-added line might disqualify a previously-applied coupon).
     */
    appliedCoupons?: DiscounterCouponContext[];
    /** Viewer context for per-user limits and email restrictions. */
    customer?: DiscounterCustomerContext | null;
}): Promise<CartTotalsResult> {
    const discounterInput = buildDiscounterInput(args.items, args.appliedCoupons ?? [], args.customer ?? null);
    const discounterResult = await args.discounter.calculate(discounterInput);

    const rateCache = new Map<number, ReadonlyArray<TaxRateInput>>();
    const rateProvider: CartTaxRateProvider = (taxClassId) => rateCache.get(taxClassId) ?? [];
    if (args.address) {
        const classIds = new Set<number>();
        for (const item of args.items) {
            if (item.taxStatus === "taxable" && item.taxClassId !== null) classIds.add(item.taxClassId);
        }
        for (const id of classIds) {
            rateCache.set(id, await fetchRates(id, args.address));
        }
    }

    const shippingTaxRates =
        args.address && args.shippingOptions.length > 0 ? await fetchShippingTaxRates(rateCache, args.address) : [];

    return calculateCartTotals({
        items: args.items,
        address: args.address,
        selectedRateId: args.selectedRateId,
        discounterResult,
        pricesIncludeTax: args.pricesIncludeTax,
        rateProvider,
        shippingOptions: args.shippingOptions,
        shippingTaxRates,
    });
}

function buildDiscounterInput(
    items: CartTotalsItem[],
    appliedCoupons: DiscounterCouponContext[],
    customer: DiscounterCustomerContext | null,
) {
    const lines: DiscounterItem[] = items.map((item) => ({
        lineKey: item.lineKey,
        productId: item.productId,
        variationId: item.variationId,
        quantity: item.quantity,
        priceSnapshot: item.priceSnapshot,
        lineSubtotal: item.priceSnapshot * item.quantity,
        categoryIds: item.categoryIds ?? [],
        tagIds: item.tagIds ?? [],
        onSale: item.onSale ?? false,
    }));
    return {
        items: lines,
        itemsTotal: lines.reduce((sum, line) => sum + line.lineSubtotal, 0),
        appliedCoupons,
        customer,
    };
}

/**
 * Collect every `applies_to_shipping=true` rate across the loaded class caches and dedupe by id.
 * Shipping tax is independent of the line's tax class — any applicable rate fires on the carrier
 * line — so we pool rates rather than running one fetch per class.
 */
async function fetchShippingTaxRates(
    rateCache: Map<number, ReadonlyArray<TaxRateInput>>,
    address: TaxAddress,
): Promise<TaxRateInput[]> {
    const seen = new Set<number>();
    const collected: TaxRateInput[] = [];
    for (const rates of rateCache.values()) {
        for (const rate of rates) {
            if (!rate.appliesToShipping) continue;
            const numericId = Number(rate.id);
            if (seen.has(numericId)) continue;
            seen.add(numericId);
            collected.push(rate);
        }
    }
    if (collected.length > 0 || rateCache.size > 0) {
        return collected;
    }
    /** Cart has no items yet — still surface address-derived shipping rates if the seed defines them. */
    const standardClass = await firstStandardTaxClassId();
    if (!standardClass) return [];
    const rates = await fetchRates(standardClass, address);
    return rates.filter((rate) => rate.appliesToShipping);
}

async function firstStandardTaxClassId(): Promise<number | null> {
    const { default: TaxClass } = await import("#models/tax_class");
    const row = await TaxClass.query().where("slug", "standard").first();
    return row ? Number(row.id) : null;
}
