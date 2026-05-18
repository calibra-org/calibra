import { test } from "@japa/runner";

import { bankersRound } from "#services/rounding";
import { calculateTax, type TaxRateInput } from "#services/tax_calculator";

function rate(overrides: Partial<TaxRateInput> & { id: number; ratePercent: number }): TaxRateInput {
    return {
        id: overrides.id,
        label: overrides.label ?? `Rate ${overrides.id}`,
        ratePercent: overrides.ratePercent,
        priority: overrides.priority ?? 1,
        compound: overrides.compound ?? false,
        appliesToShipping: overrides.appliesToShipping ?? false,
        ordering: overrides.ordering ?? 0,
    };
}

test.group("tax_calculator", () => {
    test("standard 10% rate fires for an IR address", ({ assert }) => {
        const result = calculateTax(10_000_000, [rate({ id: 1, ratePercent: 10 })], { pricesIncludeTax: false });
        assert.equal(result.tax, 1_000_000);
        assert.equal(result.base, 10_000_000);
        assert.equal(result.breakdown.length, 1);
    });

    test("zero rates yields zero tax", ({ assert }) => {
        const result = calculateTax(10_000_000, [], { pricesIncludeTax: false });
        assert.equal(result.tax, 0);
        assert.deepEqual(result.breakdown, []);
    });

    test("two non-compound rates in the same priority slot pick the first by ordering", ({ assert }) => {
        const result = calculateTax(
            10_000_000,
            [rate({ id: 1, ratePercent: 8, ordering: 1 }), rate({ id: 2, ratePercent: 10, ordering: 0 })],
            { pricesIncludeTax: false },
        );
        assert.equal(result.tax, 1_000_000);
        assert.equal(result.breakdown.length, 1);
        assert.equal(result.breakdown[0]?.rate_id, 2);
    });

    test("compound rate stacks on top of the running tax total", ({ assert }) => {
        const result = calculateTax(
            10_000_000,
            [rate({ id: 1, ratePercent: 10 }), rate({ id: 2, ratePercent: 5, compound: true })],
            { pricesIncludeTax: false },
        );
        assert.equal(result.tax, 1_000_000 + bankersRound(11_000_000 * 0.05));
    });

    test("tax-inclusive single-rate extracts base correctly", ({ assert }) => {
        const result = calculateTax(11_000_000, [rate({ id: 1, ratePercent: 10 })], { pricesIncludeTax: true });
        assert.equal(result.base, 10_000_000);
        assert.equal(result.tax, 1_000_000);
    });

    test("zero amount short-circuits", ({ assert }) => {
        const result = calculateTax(0, [rate({ id: 1, ratePercent: 10 })], { pricesIncludeTax: true });
        assert.equal(result.tax, 0);
        assert.equal(result.base, 0);
    });

    test("multiple priorities fire one non-compound each", ({ assert }) => {
        const result = calculateTax(
            10_000_000,
            [
                rate({ id: 1, ratePercent: 9, priority: 1, ordering: 0 }),
                rate({ id: 2, ratePercent: 1, priority: 2, ordering: 0 }),
            ],
            { pricesIncludeTax: false },
        );
        assert.equal(result.breakdown.length, 2);
        assert.equal(result.tax, 900_000 + 100_000);
    });
});
