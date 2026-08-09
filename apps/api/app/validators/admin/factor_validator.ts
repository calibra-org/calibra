import vine from "@vinejs/vine";

import { FACTOR_STATUSES, FACTOR_TYPES } from "#services/factor/lifecycle";

const nullableText = (maxLength: number) => vine.string().trim().maxLength(maxLength).optional().nullable();
const positiveId = () => vine.number().withoutDecimals().positive();
const nonNegativeMoney = () => vine.number().withoutDecimals().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveMoney = () => vine.number().withoutDecimals().positive().max(Number.MAX_SAFE_INTEGER);
const positiveVersion = () => vine.number().withoutDecimals().positive();

const customerShape = vine.object({
    name: vine.string().trim().minLength(1).maxLength(180),
    email: vine.string().trim().email().maxLength(254).optional().nullable(),
    phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
    company: nullableText(180),
    national_id: nullableText(32),
});

const lineShape = vine.object({
    product_id: positiveId().optional().nullable(),
    variation_id: positiveId().optional().nullable(),
    sku: nullableText(191),
    name: vine.string().trim().minLength(1).maxLength(255),
    description: nullableText(2000),
    quantity: vine.number().withoutDecimals().positive().max(100_000),
    unit_price_minor: nonNegativeMoney(),
    discount_percent: vine.number().min(0).max(100).optional(),
});

const documentShape = {
    type: vine.enum(["proforma", "invoice"] as const),
    customer_id: positiveId().optional().nullable(),
    customer: customerShape,
    lines: vine.array(lineShape).minLength(1).maxLength(250),
    order_discount_minor: nonNegativeMoney().optional(),
    shipping_minor: nonNegativeMoney().optional(),
    tax_percent: vine.number().min(0).max(100).optional(),
    round_to_minor: vine.enum([1, 10, 100, 1000] as const).optional(),
    customer_note: nullableText(5000),
    internal_note: nullableText(5000),
    due_at: vine.string().trim().optional().nullable(),
    expires_at: vine.string().trim().optional().nullable(),
    delivery_channel: vine.enum(["none", "sms", "email", "whatsapp"] as const).optional(),
    expected_version: positiveVersion().optional(),
};

export const adminFactorListValidator = vine.compile(
    vine.object({
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
        q: vine.string().trim().maxLength(120).optional(),
        type: vine.enum(FACTOR_TYPES).optional(),
        status: vine.enum(FACTOR_STATUSES).optional(),
        customer_id: positiveId().optional(),
        from: vine.string().trim().optional(),
        to: vine.string().trim().optional(),
        sort: vine.enum(["created_desc", "created_asc", "due_asc", "amount_desc"] as const).optional(),
    }),
);

export const adminFactorCreateValidator = vine.compile(
    vine.object({
        ...documentShape,
        type: vine.enum(["proforma", "invoice"] as const),
        status: vine.enum(["draft", "sent"] as const).optional(),
    }),
);

export const adminFactorUpdateValidator = vine.compile(vine.object({ ...documentShape, expected_version: positiveVersion() }));

export const adminFactorTransitionValidator = vine.compile(
    vine.object({
        to_status: vine.enum(["sent", "viewed", "awaiting", "paid", "expired", "cancelled"] as const),
        reason: nullableText(1000),
        expected_version: positiveVersion(),
    }),
);

export const adminFactorConvertValidator = vine.compile(
    vine.object({
        target_type: vine.enum(["invoice", "credit_note"] as const),
        expected_version: positiveVersion(),
        reason: nullableText(1000),
    }),
);

export const adminFactorPaymentLinkValidator = vine.compile(
    vine.object({
        gateway_id: positiveId(),
        expires_at: vine.string().trim().optional().nullable(),
        expected_version: positiveVersion(),
    }),
);

export const adminFactorManualPaymentValidator = vine.compile(
    vine.object({
        amount_minor: positiveMoney(),
        method: vine.enum(["manual", "cash", "card", "bank_transfer"] as const),
        reference: nullableText(191),
        notes: nullableText(2000),
        paid_at: vine.string().trim().optional().nullable(),
        expected_version: positiveVersion(),
    }),
);

export const adminFactorSettingsValidator = vine.compile(
    vine.object({
        reference_prefix: vine
            .string()
            .trim()
            .minLength(1)
            .maxLength(16)
            .regex(/^[A-Za-z0-9-]+$/)
            .optional(),
        default_type: vine.enum(["proforma", "invoice"] as const).optional(),
        default_tax_percent: vine.number().min(0).max(100).optional(),
        default_expiry_days: vine.number().withoutDecimals().min(1).max(365).optional(),
        round_to_minor: vine.enum([1, 10, 100, 1000] as const).optional(),
        default_delivery_channel: vine.enum(["none", "sms", "email", "whatsapp"] as const).optional(),
        bank_account_title: nullableText(180),
        bank_iban: nullableText(64),
        bank_card_number: nullableText(32),
        footer_note: nullableText(2000),
    }),
);

export const adminFactorResourceSearchValidator = vine.compile(
    vine.object({
        kind: vine.enum(["customers", "products"] as const),
        q: vine.string().trim().maxLength(120).optional(),
        limit: vine.number().withoutDecimals().min(1).max(50).optional(),
    }),
);

export const adminFactorPaymentAttemptListValidator = vine.compile(
    vine.object({
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
        status: vine.enum(["initiated", "awaiting_callback", "verified", "failed", "cancelled", "refunded"] as const).optional(),
        q: vine.string().trim().maxLength(120).optional(),
    }),
);
