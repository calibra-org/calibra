import type { FactorStatus, FactorType } from "./types";

export const FACTOR_TYPE_LABELS: Record<FactorType, string> = {
    proforma: "پیش‌فاکتور",
    invoice: "فاکتور",
    credit_note: "سند اصلاحی",
};

export const FACTOR_STATUS_LABELS: Record<FactorStatus, string> = {
    draft: "پیش‌نویس",
    sent: "ارسال‌شده",
    viewed: "دیده‌شده",
    awaiting: "در انتظار پرداخت",
    paid: "پرداخت‌شده",
    expired: "منقضی",
    cancelled: "لغوشده",
    refunded: "بازپرداخت‌شده",
    credited: "اصلاح‌شده",
};

export const FACTOR_STATUS_TONES: Record<FactorStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
    draft: "neutral",
    sent: "info",
    viewed: "info",
    awaiting: "warning",
    paid: "success",
    expired: "danger",
    cancelled: "danger",
    refunded: "warning",
    credited: "neutral",
};

export function calculateEditorTotal(input: {
    lines: Array<{ quantity: number; unit_price_minor: number; discount_percent: number }>;
    order_discount_minor: number;
    shipping_minor: number;
    tax_percent: number;
    round_to_minor: number;
}) {
    const subtotal = input.lines.reduce((sum, line) => sum + line.quantity * line.unit_price_minor, 0);
    const lineDiscount = input.lines.reduce(
        (sum, line) => sum + Math.round((line.quantity * line.unit_price_minor * line.discount_percent) / 100),
        0,
    );
    const orderDiscount = Math.min(Math.max(0, input.order_discount_minor), Math.max(0, subtotal - lineDiscount));
    const taxable = Math.max(0, subtotal - lineDiscount - orderDiscount + Math.max(0, input.shipping_minor));
    const tax = Math.round((taxable * Math.max(0, input.tax_percent)) / 100);
    const beforeRound = taxable + tax;
    const roundTo = Math.max(1, input.round_to_minor || 1);
    const payable = Math.round(beforeRound / roundTo) * roundTo;
    return {
        subtotal,
        lineDiscount,
        orderDiscount,
        shipping: input.shipping_minor,
        tax,
        rounding: payable - beforeRound,
        payable,
    };
}
