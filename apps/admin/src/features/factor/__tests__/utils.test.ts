import { describe, expect, it } from "vitest";

import { calculateEditorTotal, FACTOR_STATUS_LABELS, FACTOR_STATUS_TONES, FACTOR_TYPE_LABELS } from "../utils";

describe("factor Persian labels", () => {
    it("covers every document type", () => {
        expect(Object.keys(FACTOR_TYPE_LABELS).sort()).toEqual(["credit_note", "invoice", "proforma"]);
    });

    it("covers every status with a label and visual tone", () => {
        expect(Object.keys(FACTOR_STATUS_LABELS).sort()).toEqual(Object.keys(FACTOR_STATUS_TONES).sort());
        expect(FACTOR_STATUS_LABELS.awaiting).toBe("در انتظار پرداخت");
        expect(FACTOR_STATUS_TONES.paid).toBe("success");
    });
});

describe("factor editor preview calculator", () => {
    for (let index = 1; index <= 60; index += 1) {
        it(`matches the server money contract for deterministic case ${index}`, () => {
            const quantity = (index % 9) + 1;
            const unit = index * 10_001;
            const discount = index % 35;
            const orderDiscount = index * 101;
            const shipping = index * 57;
            const taxPercent = index % 11;
            const roundTo = [1, 10, 100][index % 3]!;
            const result = calculateEditorTotal({
                lines: [{ quantity, unit_price_minor: unit, discount_percent: discount }],
                order_discount_minor: orderDiscount,
                shipping_minor: shipping,
                tax_percent: taxPercent,
                round_to_minor: roundTo,
            });
            const subtotal = quantity * unit;
            const lineDiscount = Math.round((subtotal * discount) / 100);
            const boundedOrderDiscount = Math.min(orderDiscount, subtotal - lineDiscount);
            const taxable = subtotal - lineDiscount - boundedOrderDiscount + shipping;
            const tax = Math.round((taxable * taxPercent) / 100);
            const beforeRounding = taxable + tax;
            const payable = Math.round(beforeRounding / roundTo) * roundTo;
            expect(result).toEqual({
                subtotal,
                lineDiscount,
                orderDiscount: boundedOrderDiscount,
                shipping,
                tax,
                rounding: payable - beforeRounding,
                payable,
            });
        });
    }

    it("never lets the order discount make the taxable amount negative", () => {
        const result = calculateEditorTotal({
            lines: [{ quantity: 1, unit_price_minor: 1_000, discount_percent: 0 }],
            order_discount_minor: 99_999,
            shipping_minor: 0,
            tax_percent: 9,
            round_to_minor: 10,
        });
        expect(result.payable).toBe(0);
    });
});
