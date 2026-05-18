import { test } from "@japa/runner";

import type { Discounter, DiscounterResult } from "#contracts/discounter";
import { type CartTotalsInput, type CartTotalsItem, calculateCartTotals } from "#services/cart_totals_service";
import type { TaxRateInput } from "#services/tax_calculator";

const STANDARD_VAT: TaxRateInput = {
    id: 1,
    label: "VAT 10%",
    ratePercent: 10,
    priority: 1,
    compound: false,
    appliesToShipping: false,
    ordering: 0,
};

const IR_ADDRESS = { country: "IR", regionId: 24 };

function itemFactory(overrides: Partial<CartTotalsItem> = {}): CartTotalsItem {
    return {
        lineKey: overrides.lineKey ?? "1",
        id: overrides.id ?? 1,
        productId: overrides.productId ?? 1,
        variationId: overrides.variationId ?? null,
        quantity: overrides.quantity ?? 1,
        priceSnapshot: overrides.priceSnapshot ?? 0,
        taxClassId: overrides.taxClassId ?? 1,
        taxStatus: overrides.taxStatus ?? "taxable",
        requiresShipping: overrides.requiresShipping ?? true,
    };
}

function inputFactory(overrides: Partial<CartTotalsInput> & { discounterResult?: DiscounterResult }): CartTotalsInput {
    return {
        items: overrides.items ?? [],
        address: overrides.address ?? IR_ADDRESS,
        selectedRateId: overrides.selectedRateId ?? null,
        discounterResult: overrides.discounterResult ?? {
            discountTotal: 0,
            discountTaxTotal: 0,
            freeShipping: false,
            perLineDiscounts: new Map(),
        },
        pricesIncludeTax: overrides.pricesIncludeTax ?? true,
        rateProvider: overrides.rateProvider ?? (() => [STANDARD_VAT]),
        shippingOptions: overrides.shippingOptions ?? [],
        shippingTaxRates: overrides.shippingTaxRates ?? [],
    };
}

test.group("cart_totals_service", () => {
    test("tax-inclusive prices extract base correctly", ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 11_000_000, quantity: 1 })],
                pricesIncludeTax: true,
            }),
        );
        assert.equal(totals.itemsTotal, 10_000_000);
        assert.equal(totals.itemsTaxTotal, 1_000_000);
        assert.equal(totals.taxTotal, 1_000_000);
        assert.equal(totals.grandTotal, 11_000_000);
    });

    test("tax-exclusive prices add tax on top of subtotal", ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 10_000_000, quantity: 1 })],
                pricesIncludeTax: false,
            }),
        );
        assert.equal(totals.itemsTotal, 10_000_000);
        assert.equal(totals.itemsTaxTotal, 1_000_000);
        assert.equal(totals.grandTotal, 11_000_000);
    });

    test("single line with no shipping yields items_total plus tax", ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 5_500_000, quantity: 2 })],
                pricesIncludeTax: true,
            }),
        );
        assert.equal(totals.itemsTotal, 10_000_000);
        assert.equal(totals.itemsTaxTotal, 1_000_000);
        assert.equal(totals.shippingTotal, 0);
        assert.equal(totals.grandTotal, 11_000_000);
    });

    test("multiple lines sum into items_total", ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [
                    itemFactory({ id: 1, lineKey: "1", priceSnapshot: 1_100_000, quantity: 1 }),
                    itemFactory({ id: 2, lineKey: "2", priceSnapshot: 2_200_000, quantity: 2 }),
                ],
                pricesIncludeTax: true,
            }),
        );
        assert.equal(totals.itemsTotal, 1_000_000 + 4_000_000);
        assert.equal(totals.itemsTaxTotal, 100_000 + 400_000);
        assert.equal(totals.grandTotal, 5_500_000);
    });

    test("free shipping coupon overrides the carrier cost to zero", async ({ assert }) => {
        const freeShipDiscounter: Discounter = {
            async calculate() {
                return {
                    discountTotal: 0,
                    discountTaxTotal: 0,
                    freeShipping: true,
                    perLineDiscounts: new Map(),
                };
            },
        };
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 5_500_000, quantity: 2 })],
                shippingOptions: [{ id: 99, methodCode: "post_pishtaz", title: "post", cost: 500_000, taxable: true, zoneId: 1 }],
                selectedRateId: 99,
                pricesIncludeTax: true,
                discounterResult: await freeShipDiscounter.calculate({ items: [], itemsTotal: 0, appliedCoupons: [] }),
            }),
        );
        assert.equal(totals.shippingTotal, 0);
        assert.equal(totals.grandTotal, 11_000_000);
    });

    test("per-line discount reduces the line total and recomputes tax", async ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ id: 1, lineKey: "1", priceSnapshot: 2_200_000, quantity: 1 })],
                pricesIncludeTax: true,
                discounterResult: {
                    discountTotal: 1_100_000,
                    discountTaxTotal: 100_000,
                    freeShipping: false,
                    perLineDiscounts: new Map([["1", 1_100_000]]),
                },
            }),
        );
        assert.equal(totals.lines[0]?.subtotal, 2_000_000);
        assert.equal(totals.lines[0]?.subtotalTax, 200_000);
        assert.equal(totals.lines[0]?.total, 1_000_000);
        assert.equal(totals.lines[0]?.totalTax, 100_000);
        assert.equal(totals.discountTotal, 1_100_000);
        assert.equal(totals.discountTaxTotal, 100_000);
        assert.equal(totals.grandTotal, 2_000_000 + 100_000 - 1_100_000 - 100_000);
    });

    test("negative grand_total is clamped via needs_payment", ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 0, quantity: 1 })],
                pricesIncludeTax: false,
            }),
        );
        assert.equal(totals.grandTotal, 0);
        assert.isFalse(totals.needsPayment);
    });

    test("non-taxable line emits zero tax even with a configured rate", ({ assert }) => {
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 10_000_000, quantity: 1, taxStatus: "none" })],
                pricesIncludeTax: true,
            }),
        );
        assert.equal(totals.itemsTaxTotal, 0);
        assert.equal(totals.itemsTotal, 10_000_000);
    });

    test("shipping line takes its own applies_to_shipping rate", ({ assert }) => {
        const shippingRate: TaxRateInput = { ...STANDARD_VAT, id: 2, appliesToShipping: true, ratePercent: 5 };
        const totals = calculateCartTotals(
            inputFactory({
                items: [itemFactory({ priceSnapshot: 0, quantity: 0, taxStatus: "none" })],
                shippingOptions: [{ id: 7, methodCode: "tipax", title: "tipax", cost: 1_050_000, taxable: true, zoneId: 1 }],
                selectedRateId: 7,
                shippingTaxRates: [shippingRate],
                pricesIncludeTax: true,
            }),
        );
        assert.equal(totals.shippingTotal, 1_000_000);
        assert.equal(totals.shippingTaxTotal, 50_000);
    });
});
