import { test } from "@japa/runner";

import { canTransitionFactor, FACTOR_STATUSES, isFactorImmutable, isFactorStatus } from "#services/factor/lifecycle";
import { calculateFactorMoney } from "#services/factor/money";

const EXPECTED_TRANSITIONS: Record<(typeof FACTOR_STATUSES)[number], readonly string[]> = {
    draft: ["sent", "cancelled"],
    sent: ["viewed", "awaiting", "paid", "expired", "cancelled"],
    viewed: ["awaiting", "paid", "expired", "cancelled"],
    awaiting: ["paid", "expired", "cancelled"],
    paid: [],
    expired: [],
    cancelled: [],
    refunded: [],
    credited: [],
};

test.group("factor money deterministic matrix", () => {
    for (let index = 1; index <= 220; index += 1) {
        test(`case ${index}: totals stay integer, bounded and independently reproducible`, ({ assert }) => {
            const quantityA = (index % 19) + 1;
            const quantityB = (index % 7) + 1;
            const unitA = index * 1_003;
            const unitB = index * 2_011;
            const discountA = index % 31;
            const discountB = (index * 3) % 41;
            const orderDiscount = index * 17;
            const shipping = index * 23;
            const taxPercent = index % 15;
            const roundTo = [1, 10, 100, 1_000][index % 4]!;

            const actual = calculateFactorMoney(
                [
                    { quantity: quantityA, unitPriceMinor: unitA, discountPercent: discountA },
                    { quantity: quantityB, unitPriceMinor: unitB, discountPercent: discountB },
                ],
                { orderDiscountMinor: orderDiscount, shippingMinor: shipping, taxPercent, roundToMinor: roundTo },
            );

            const grossA = quantityA * unitA;
            const grossB = quantityB * unitB;
            const lineDiscountA = Math.round((grossA * discountA) / 100);
            const lineDiscountB = Math.round((grossB * discountB) / 100);
            const subtotal = grossA + grossB;
            const lineDiscount = lineDiscountA + lineDiscountB;
            const boundedOrderDiscount = Math.min(orderDiscount, subtotal - lineDiscount);
            const taxable = subtotal - lineDiscount - boundedOrderDiscount + shipping;
            const tax = Math.round((taxable * taxPercent) / 100);
            const beforeRounding = taxable + tax;
            const payable = Math.round(beforeRounding / roundTo) * roundTo;

            assert.equal(actual.subtotalMinor, subtotal);
            assert.equal(actual.lineDiscountMinor, lineDiscount);
            assert.equal(actual.orderDiscountMinor, boundedOrderDiscount);
            assert.equal(actual.taxMinor, tax);
            assert.equal(actual.payableMinor, payable);
            assert.equal(actual.roundingMinor, payable - beforeRounding);
            assert.equal(
                actual.lines.reduce((sum, line) => sum + line.allocatedOrderDiscountMinor, 0),
                boundedOrderDiscount,
            );
            assert.equal(actual.lines.reduce((sum, line) => sum + line.taxMinor, 0) + actual.shippingTaxMinor, tax);
            assert.equal(
                actual.lines.reduce((sum, line) => sum + line.netMinor, 0) +
                    shipping +
                    tax +
                    actual.roundingMinor -
                    boundedOrderDiscount,
                payable,
            );
            assert.isTrue(Number.isSafeInteger(actual.payableMinor));
            assert.isAtLeast(actual.payableMinor, 0);
        });
    }

    test("caps a discount above 100 percent", ({ assert }) => {
        const result = calculateFactorMoney([{ quantity: 1, unitPriceMinor: 10_000, discountPercent: 150 }]);
        assert.equal(result.payableMinor, 0);
    });

    test("caps an order discount at the post-line-discount subtotal", ({ assert }) => {
        const result = calculateFactorMoney([{ quantity: 2, unitPriceMinor: 5_000, discountPercent: 10 }], {
            orderDiscountMinor: 99_999,
        });
        assert.equal(result.orderDiscountMinor, 9_000);
        assert.equal(result.payableMinor, 0);
    });

    test("rejects a negative monetary input", ({ assert }) => {
        assert.throws(
            () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: -1 }]),
            "unitPriceMinor 0 must be a safe non-negative integer",
        );
    });

    test("rejects a fractional quantity", ({ assert }) => {
        assert.throws(
            () => calculateFactorMoney([{ quantity: 1.5, unitPriceMinor: 1_000 }]),
            "quantity 0 must be a safe non-negative integer",
        );
    });

    test("rejects a zero quantity", ({ assert }) => {
        assert.throws(() => calculateFactorMoney([{ quantity: 0, unitPriceMinor: 1_000 }]), "quantity must be greater than zero");
    });

    test("rejects fractional monetary options", ({ assert }) => {
        assert.throws(
            () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: 1_000 }], { orderDiscountMinor: 1.5 }),
            "orderDiscountMinor must be a safe non-negative integer",
        );
        assert.throws(
            () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: 1_000 }], { shippingMinor: 1.5 }),
            "shippingMinor must be a safe non-negative integer",
        );
        assert.throws(
            () => calculateFactorMoney([{ quantity: 1, unitPriceMinor: 1_000 }], { roundToMinor: 1.5 }),
            "roundToMinor must be a safe non-negative integer",
        );
    });

    test("allocates tax and document discount exactly across lines and shipping", ({ assert }) => {
        const result = calculateFactorMoney(
            [
                { quantity: 3, unitPriceMinor: 1_001, discountPercent: 7 },
                { quantity: 2, unitPriceMinor: 2_003, discountPercent: 11 },
            ],
            { orderDiscountMinor: 333, shippingMinor: 777, taxPercent: 9, roundToMinor: 10 },
        );
        assert.equal(
            result.lines.reduce((sum, line) => sum + line.allocatedOrderDiscountMinor, 0),
            result.orderDiscountMinor,
        );
        assert.equal(result.lines.reduce((sum, line) => sum + line.taxMinor, 0) + result.shippingTaxMinor, result.taxMinor);
    });

    test("includes shipping in the taxable base", ({ assert }) => {
        const result = calculateFactorMoney([], { shippingMinor: 100_000, taxPercent: 10 });
        assert.equal(result.taxMinor, 10_000);
        assert.equal(result.payableMinor, 110_000);
    });
});

test.group("factor lifecycle complete transition matrix", () => {
    for (const from of FACTOR_STATUSES) {
        for (const to of FACTOR_STATUSES) {
            test(`${from} -> ${to} matches the approved lifecycle`, ({ assert }) => {
                assert.equal(canTransitionFactor(from, to), EXPECTED_TRANSITIONS[from].includes(to));
            });
        }
    }

    for (const status of FACTOR_STATUSES) {
        test(`${status} is recognized as a factor status`, ({ assert }) => {
            assert.isTrue(isFactorStatus(status));
        });
    }

    for (const status of FACTOR_STATUSES) {
        test(`${status} immutability matches the accounting lock rule`, ({ assert }) => {
            assert.equal(isFactorImmutable(status), ["paid", "refunded", "credited"].includes(status));
        });
    }

    test("unknown values are rejected", ({ assert }) => {
        assert.isFalse(isFactorStatus("unknown"));
    });
});
