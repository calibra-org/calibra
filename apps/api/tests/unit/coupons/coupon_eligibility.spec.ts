import { test } from "@japa/runner";
import { DateTime } from "luxon";

import type { DiscounterItem } from "#contracts/discounter";
import { type CouponSnapshot, checkEligibility } from "#services/discounter_service";

function snap(overrides: Partial<CouponSnapshot>): CouponSnapshot {
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

function items(): DiscounterItem[] {
    return [
        {
            lineKey: "1",
            productId: 1,
            variationId: null,
            quantity: 1,
            priceSnapshot: 1_000_000,
            lineSubtotal: 1_000_000,
            categoryIds: [10],
            tagIds: [],
            onSale: false,
        },
    ];
}

const NOW = DateTime.utc();

test.group("Eligibility — each reason", () => {
    test("disabled coupon", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ status: "disabled" }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "disabled");
    });

    test("not_yet_active when starts_at is in the future", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ startsAt: NOW.plus({ days: 1 }) }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "not_yet_active");
    });

    test("expired when expires_at is in the past", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ expiresAt: NOW.minus({ days: 1 }) }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "expired");
    });

    test("below_minimum when itemsTotal < minimum_amount", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ minimumAmount: 5_000_000 }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "below_minimum");
    });

    test("above_maximum when itemsTotal > maximum_amount", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ maximumAmount: 500_000 }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "above_maximum");
    });

    test("no_eligible_items when product include doesn't match", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ productConstraints: [{ productId: 9999, mode: "include" }] }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "no_eligible_items");
    });

    test("only_sale_items when every eligible item is on sale and exclude_sale_items is set", ({ assert }) => {
        const lines: DiscounterItem[] = items().map((i) => ({ ...i, onSale: true }));
        const result = checkEligibility({
            coupon: snap({ excludeSaleItems: true }),
            items: lines,
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "only_sale_items");
    });

    test("individual_use_conflict when other coupons already applied", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ individualUse: true }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [5],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "individual_use_conflict");
    });

    test("email_not_allowed when restrictions are set and email doesn't match", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ emailRestrictions: ["vip@*"] }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: { customerId: null, email: "guest@example.com" },
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "email_not_allowed");
    });

    test("email matches glob pattern", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ emailRestrictions: ["vip@*"] }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: { customerId: null, email: "vip@calibra.com" },
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isTrue(result.ok);
    });

    test("usage_limit_global_reached", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ usageLimitGlobal: 5 }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 5,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "usage_limit_global_reached");
    });

    test("usage_limit_per_user_reached", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({ usageLimitPerUser: 1 }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: { customerId: 7, email: "x@y.com" },
            globalRedemptionCount: 0,
            perUserRedemptionCount: 1,
            now: NOW,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "usage_limit_per_user_reached");
    });

    test("ok when every check passes", ({ assert }) => {
        const result = checkEligibility({
            coupon: snap({}),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isTrue(result.ok);
    });
});
