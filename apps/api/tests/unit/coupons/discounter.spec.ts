import { test } from "@japa/runner";
import { DateTime } from "luxon";

import type { DiscounterInput, DiscounterItem } from "#contracts/discounter";
import { type CouponSnapshot, computeDiscounts } from "#services/discounter_service";

function item(overrides: Partial<DiscounterItem> & { lineKey: string; quantity: number; priceSnapshot: number }): DiscounterItem {
    return {
        productId: 1,
        variationId: null,
        categoryIds: [],
        tagIds: [],
        onSale: false,
        lineSubtotal: overrides.priceSnapshot * overrides.quantity,
        ...overrides,
    };
}

function coupon(overrides: Partial<CouponSnapshot>): CouponSnapshot {
    return {
        id: 1,
        code: "X",
        discountType: "percent",
        amountMinor: null,
        amountPercent: 10,
        status: "active",
        startsAt: null,
        expiresAt: null,
        minimumAmount: null,
        maximumAmount: null,
        individualUse: false,
        excludeSaleItems: false,
        usageLimitGlobal: null,
        usageLimitPerUser: null,
        limitUsageToXItems: null,
        freeShipping: false,
        productConstraints: [],
        categoryConstraints: [],
        emailRestrictions: [],
        ...overrides,
    };
}

function input(items: DiscounterItem[], coupons: CouponSnapshot[]): { input: DiscounterInput; snapshots: CouponSnapshot[] } {
    return {
        input: {
            items,
            itemsTotal: items.reduce((sum, i) => sum + i.lineSubtotal, 0),
            appliedCoupons: coupons.map((c) => ({ id: c.id, code: c.code })),
            customer: { customerId: null, email: null },
        },
        snapshots: coupons,
    };
}

test.group("Discounter — percent", () => {
    test("10% of 1,000,000 = 100,000", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 1_000_000 })];
        const { input: i, snapshots } = input(items, [
            coupon({ id: 1, code: "P10", discountType: "percent", amountPercent: 10 }),
        ]);
        const result = computeDiscounts(i, snapshots);
        assert.equal(result.perLineDiscounts.get("1"), 100_000);
        assert.equal(result.discountTotal, 100_000);
    });

    test("0% leaves the cart untouched", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 2, priceSnapshot: 500_000 })];
        const { input: i, snapshots } = input(items, [coupon({ amountPercent: 0 })]);
        const result = computeDiscounts(i, snapshots);
        assert.equal(result.discountTotal, 0);
    });

    test("limit_usage_to_x_items caps the discounted unit count", ({ assert }) => {
        /** 3 units × 100k @ 50% with cap=2 → 50k × 2 = 100k discount. */
        const items = [item({ lineKey: "1", quantity: 3, priceSnapshot: 100_000 })];
        const { input: i, snapshots } = input(items, [coupon({ amountPercent: 50, limitUsageToXItems: 2 })]);
        const result = computeDiscounts(i, snapshots);
        assert.equal(result.perLineDiscounts.get("1"), 100_000);
    });
});

test.group("Discounter — fixed_cart", () => {
    test("distributes pro-rata across 3 lines and totals match", ({ assert }) => {
        const items = [
            item({ lineKey: "1", quantity: 1, priceSnapshot: 100_000 }),
            item({ lineKey: "2", quantity: 1, priceSnapshot: 200_000 }),
            item({ lineKey: "3", quantity: 1, priceSnapshot: 300_000 }),
        ];
        const { input: i, snapshots } = input(items, [
            coupon({ discountType: "fixed_cart", amountMinor: 30_000, amountPercent: null }),
        ]);
        const result = computeDiscounts(i, snapshots);
        const total = [...result.perLineDiscounts.values()].reduce((a, b) => a + b, 0);
        assert.equal(total, 30_000);
    });

    test("rounding residual lands on the largest remaining line", ({ assert }) => {
        const items = [
            item({ lineKey: "1", quantity: 1, priceSnapshot: 100 }),
            item({ lineKey: "2", quantity: 1, priceSnapshot: 200 }),
            item({ lineKey: "3", quantity: 1, priceSnapshot: 700 }),
        ];
        /** 1 unit across 1000 total → exact 1/100/200/700 split via integer math leaves 1 unit residual. */
        const { input: i, snapshots } = input(items, [
            coupon({ discountType: "fixed_cart", amountMinor: 999, amountPercent: null }),
        ]);
        const result = computeDiscounts(i, snapshots);
        const total = [...result.perLineDiscounts.values()].reduce((a, b) => a + b, 0);
        assert.equal(total, 999);
        const largest = result.perLineDiscounts.get("3") ?? 0;
        const middle = result.perLineDiscounts.get("2") ?? 0;
        assert.isAtLeast(largest, middle);
    });

    test("coupon worth more than the cart caps at remaining subtotal", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 10_000 })];
        const { input: i, snapshots } = input(items, [
            coupon({ discountType: "fixed_cart", amountMinor: 50_000, amountPercent: null }),
        ]);
        const result = computeDiscounts(i, snapshots);
        assert.equal(result.discountTotal, 10_000);
    });
});

test.group("Discounter — fixed_product", () => {
    test("per-unit amount × quantity, capped at line total", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 3, priceSnapshot: 50_000 })];
        const { input: i, snapshots } = input(items, [
            coupon({ discountType: "fixed_product", amountMinor: 100_000, amountPercent: null }),
        ]);
        /** 100k × 3 = 300k, but the line is only 150k → capped. */
        const result = computeDiscounts(i, snapshots);
        assert.equal(result.perLineDiscounts.get("1"), 150_000);
    });
});

test.group("Discounter — sort order", () => {
    test("fixed_product runs before percent runs before fixed_cart", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 1_000_000 })];
        const fp = coupon({ id: 1, code: "FP", discountType: "fixed_product", amountMinor: 100_000, amountPercent: null });
        const p10 = coupon({ id: 2, code: "P10", discountType: "percent", amountPercent: 10 });
        const fc = coupon({ id: 3, code: "FC", discountType: "fixed_cart", amountMinor: 50_000, amountPercent: null });
        /** Same input, different ordering — result must be identical. */
        const a = computeDiscounts(input(items, [fc, p10, fp]).input, [fc, p10, fp]);
        const b = computeDiscounts(input(items, [fp, p10, fc]).input, [fp, p10, fc]);
        assert.equal(a.discountTotal, b.discountTotal);
        /** 1m − 100k = 900k, then 10% off = 90k off → 810k remaining, then 50k fixed_cart → total disc = 240k. */
        assert.equal(a.discountTotal, 100_000 + 90_000 + 50_000);
    });
});

test.group("Discounter — individual_use", () => {
    test("individual_use coupon disables stacking with others", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 1_000_000 })];
        const indiv = coupon({ id: 1, code: "I", discountType: "percent", amountPercent: 50, individualUse: true });
        const other = coupon({ id: 2, code: "O", discountType: "percent", amountPercent: 10 });
        const result = computeDiscounts(input(items, [indiv, other]).input, [indiv, other]);
        /** Only the 50% coupon should fire. */
        assert.equal(result.discountTotal, 500_000);
    });
});

test.group("Discounter — free_shipping", () => {
    test("free_shipping coupon sets the flag without touching line discounts", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 500_000 })];
        const fs = coupon({ id: 1, code: "FS", discountType: "free_shipping" });
        const result = computeDiscounts(input(items, [fs]).input, [fs]);
        assert.equal(result.discountTotal, 0);
        assert.isTrue(result.freeShipping);
    });

    test("orthogonal free_shipping flag on a percent coupon also frees shipping", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 1_000_000 })];
        const p = coupon({ id: 1, code: "P", discountType: "percent", amountPercent: 10, freeShipping: true });
        const result = computeDiscounts(input(items, [p]).input, [p]);
        assert.isTrue(result.freeShipping);
        assert.equal(result.discountTotal, 100_000);
    });
});

test.group("Discounter — constraints", () => {
    test("exclude_sale_items skips lines whose snapshot is on sale", ({ assert }) => {
        const items = [
            item({ lineKey: "1", quantity: 1, priceSnapshot: 100_000, onSale: true }),
            item({ lineKey: "2", quantity: 1, priceSnapshot: 100_000, onSale: false }),
        ];
        const c = coupon({ id: 1, code: "S", excludeSaleItems: true, amountPercent: 50 });
        const result = computeDiscounts(input(items, [c]).input, [c]);
        assert.equal(result.perLineDiscounts.get("1") ?? 0, 0);
        assert.equal(result.perLineDiscounts.get("2") ?? 0, 50_000);
    });

    test("category include constrains to lines in that category", ({ assert }) => {
        const items = [
            item({ lineKey: "1", quantity: 1, priceSnapshot: 100_000, categoryIds: [10] }),
            item({ lineKey: "2", quantity: 1, priceSnapshot: 100_000, categoryIds: [20] }),
        ];
        const c = coupon({
            id: 1,
            code: "C",
            amountPercent: 50,
            categoryConstraints: [{ categoryId: 10, mode: "include" }],
        });
        const result = computeDiscounts(input(items, [c]).input, [c]);
        assert.equal(result.perLineDiscounts.get("1") ?? 0, 50_000);
        assert.equal(result.perLineDiscounts.get("2") ?? 0, 0);
    });

    test("product exclude removes that single line from eligibility", ({ assert }) => {
        const items = [
            item({ lineKey: "1", productId: 100, quantity: 1, priceSnapshot: 100_000 }),
            item({ lineKey: "2", productId: 200, quantity: 1, priceSnapshot: 100_000 }),
        ];
        const c = coupon({
            id: 1,
            code: "X",
            amountPercent: 50,
            productConstraints: [{ productId: 100, mode: "exclude" }],
        });
        const result = computeDiscounts(input(items, [c]).input, [c]);
        assert.equal(result.perLineDiscounts.get("1") ?? 0, 0);
        assert.equal(result.perLineDiscounts.get("2") ?? 0, 50_000);
    });
});

test.group("Discounter — empty inputs", () => {
    test("returns the no-op result when no coupons are applied", ({ assert }) => {
        const items = [item({ lineKey: "1", quantity: 1, priceSnapshot: 100_000 })];
        const result = computeDiscounts({ items, itemsTotal: 100_000, appliedCoupons: [], customer: null }, []);
        assert.equal(result.discountTotal, 0);
        assert.isFalse(result.freeShipping);
        assert.equal(result.perLineDiscounts.size, 0);
    });
});

void DateTime;
