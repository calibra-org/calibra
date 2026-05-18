import db from "@adonisjs/lucid/services/db";

import { bankersRound } from "#services/rounding";

/**
 * Input rate descriptor for the pure {@link calculateTax} math. Decoupled from the Lucid model so
 * the function unit-tests without a database (the integration boundary is {@link fetchRates}).
 */
export interface TaxRateInput {
    id: bigint | number;
    label: string;
    /** Percentage as a number (e.g. 10.0 for 10%). */
    ratePercent: number;
    priority: number;
    compound: boolean;
    appliesToShipping: boolean;
    ordering: number;
}

export interface TaxBreakdownLine {
    rate_id: number;
    label: string;
    rate_percent: number;
    amount: number;
}

export interface TaxCalculationResult {
    /** Total tax due in minor units (sum of every breakdown line). */
    tax: number;
    /** Pre-tax base. When `pricesIncludeTax = true`, this is `input - tax`. Otherwise equals input. */
    base: number;
    breakdown: TaxBreakdownLine[];
}

export interface TaxCalculationOptions {
    /** When true, the input amount is treated as gross (tax-inclusive) and the base is extracted. */
    pricesIncludeTax: boolean;
}

export interface TaxAddress {
    country: string | null;
    regionId: number | null;
}

/**
 * Apply the configured rate stack to a base (or gross) amount. Pure function — no DB access,
 * no clock — so the math can be unit-tested deterministically with synthetic rate objects.
 *
 * Per ADR §"Shipping/tax/coupon math": rates are grouped by priority; within each priority slot at
 * most one non-compound rate fires (first match by `ordering`), and every compound rate at that
 * priority fires on top of the running total. When `pricesIncludeTax` is true, the base is first
 * extracted from the gross amount via the combined divisor before the per-rate amounts are
 * recomputed against the extracted base.
 */
export function calculateTax(
    amount: number,
    rates: ReadonlyArray<TaxRateInput>,
    options: TaxCalculationOptions,
): TaxCalculationResult {
    if (rates.length === 0 || amount === 0) {
        return { tax: 0, base: amount, breakdown: [] };
    }

    const effective = pickEffectiveRates(rates);
    if (effective.length === 0) {
        return { tax: 0, base: amount, breakdown: [] };
    }

    const base = options.pricesIncludeTax ? extractBase(amount, effective) : amount;

    const breakdown: TaxBreakdownLine[] = [];
    let runningTotal = base;
    for (const rate of effective) {
        const taxable = rate.compound ? runningTotal : base;
        const lineAmount = bankersRound((taxable * rate.ratePercent) / 100);
        breakdown.push({
            rate_id: Number(rate.id),
            label: rate.label,
            rate_percent: rate.ratePercent,
            amount: lineAmount,
        });
        runningTotal += lineAmount;
    }

    const tax = breakdown.reduce((sum, line) => sum + line.amount, 0);
    return { tax, base, breakdown };
}

/**
 * Resolve which of the matched candidates actually fire. Within each priority slot, the first
 * non-compound by `ordering` wins; every compound rate at that priority fires regardless. Result
 * is ordered priority-ASC then ordering-ASC so the breakdown reads top-to-bottom in apply order.
 */
function pickEffectiveRates(rates: ReadonlyArray<TaxRateInput>): TaxRateInput[] {
    const byPriority = new Map<number, TaxRateInput[]>();
    for (const rate of rates) {
        const bucket = byPriority.get(rate.priority);
        if (bucket) {
            bucket.push(rate);
        } else {
            byPriority.set(rate.priority, [rate]);
        }
    }

    const result: TaxRateInput[] = [];
    const priorities = [...byPriority.keys()].sort((a, b) => a - b);
    for (const priority of priorities) {
        const group = byPriority.get(priority);
        if (!group) continue;
        const sorted = group.slice().sort((a, b) => a.ordering - b.ordering);
        let nonCompoundPicked = false;
        for (const rate of sorted) {
            if (rate.compound) {
                result.push(rate);
            } else if (!nonCompoundPicked) {
                result.push(rate);
                nonCompoundPicked = true;
            }
        }
    }
    return result;
}

/**
 * Invert the tax-inclusive gross to recover the pre-tax base. Non-compound rates add to a single
 * divisor; compound rates multiply that divisor (since they compound on top of the partial total).
 * Banker's rounding to a whole minor unit so subsequent per-rate amounts stay deterministic.
 */
function extractBase(gross: number, effective: TaxRateInput[]): number {
    let nonCompoundFactor = 1;
    let compoundFactor = 1;
    for (const rate of effective) {
        if (rate.compound) {
            compoundFactor *= 1 + rate.ratePercent / 100;
        } else {
            nonCompoundFactor += rate.ratePercent / 100;
        }
    }
    const divisor = nonCompoundFactor * compoundFactor;
    if (divisor === 0) return gross;
    return bankersRound(gross / divisor);
}

/**
 * Fetch the rate rows that apply to (taxClassId, address). Live integration with the `tax_rates`
 * table — kept thin so it can be swapped with a memoizing cache (later phase) without rewriting
 * the math. NULL country / NULL region columns are interpreted as "match any".
 */
export async function fetchRates(taxClassId: bigint | number, address: TaxAddress): Promise<TaxRateInput[]> {
    const query = db
        .from("tax_rates")
        .select("id", "label", "rate", "priority", "compound", "applies_to_shipping", "ordering")
        .where("tax_class_id", Number(taxClassId))
        .where((q) => {
            q.whereNull("country");
            if (address.country) q.orWhere("country", address.country.toUpperCase());
        })
        .where((q) => {
            q.whereNull("region_id");
            if (address.regionId !== null) q.orWhere("region_id", address.regionId);
        })
        .orderBy([
            { column: "priority", order: "asc" },
            { column: "ordering", order: "asc" },
        ]);

    const rows = await query;
    return rows.map((row) => ({
        id: row.id,
        label: row.label,
        ratePercent: Number.parseFloat(row.rate),
        priority: row.priority,
        compound: row.compound,
        appliesToShipping: row.applies_to_shipping,
        ordering: row.ordering,
    }));
}
