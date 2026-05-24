import vine from "@vinejs/vine";

import { ORDER_STATUS_VALUES } from "#enums/order_status";

const addressShape = vine.object({
    first_name: vine.string().trim().minLength(1).maxLength(80),
    last_name: vine.string().trim().minLength(1).maxLength(80),
    company: vine.string().trim().maxLength(200).optional().nullable(),
    address_line_1: vine.string().trim().minLength(1).maxLength(255),
    address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
    city: vine.string().trim().minLength(1).maxLength(120),
    region_id: vine.number().positive().optional().nullable(),
    region_text: vine.string().trim().maxLength(200).optional().nullable(),
    postcode: vine.string().trim().maxLength(20).optional().nullable(),
    country: vine.string().trim().fixedLength(2),
    phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
    email: vine.string().trim().email().maxLength(254).optional().nullable(),
});

const lineShape = vine.object({
    product_id: vine.number().positive(),
    variation_id: vine.number().positive().optional().nullable(),
    quantity: vine.number().positive().max(10_000),
});

/**
 * Accepts either a single string (`?key=a`), a CSV (`?key=a,b,c`), or an array (`?key[]=a&key[]=b`)
 * — different HTTP clients serialise multi-select facets differently. The vine union normalises all
 * three into `string[]` so the controller can call `whereIn` without a second pass.
 */
const csvList = vine
    .union([
        vine.union.if((value) => Array.isArray(value), vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(50)),
        vine.union.else(
            vine
                .string()
                .trim()
                .minLength(1)
                .maxLength(400)
                .transform((value) =>
                    value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0),
                ),
        ),
    ])
    .optional();

export const adminOrderListValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
        status: vine.enum([...(ORDER_STATUS_VALUES as unknown as readonly string[]), "trashed"]).optional(),
        customer_id: vine.number().positive().optional(),
        created_via: vine.enum(["checkout", "admin", "api", "import"]).optional(),
        /** Multi-value source filter (mirrors `created_via` but accepts `cod,bank_transfer` style CSV from the URL). */
        source: csvList,
        /** Multi-value filter against the snapshot of the chosen gateway's `code` column. */
        payment: csvList,
        /** Multi-value filter against the billing-address country (ISO-3166 alpha-2). */
        country: csvList,
        search: vine.string().trim().minLength(1).maxLength(120).optional(),
        after: vine.string().trim().optional(),
        before: vine.string().trim().optional(),
        sort: vine.string().trim().maxLength(40).optional(),
    }),
);

export const adminOrderMarkShippedValidator = vine.compile(
    vine.object({
        tracking_number: vine.string().trim().maxLength(120).optional().nullable(),
        tracking_url: vine.string().trim().url().maxLength(500).optional().nullable(),
        carrier: vine.string().trim().maxLength(80).optional().nullable(),
        notify_customer: vine.boolean().optional(),
    }),
);

export const adminOrderCreateValidator = vine.compile(
    vine.object({
        customer_id: vine.number().positive().optional().nullable(),
        billing_address: addressShape,
        shipping_address: addressShape.optional(),
        payment_gateway_id: vine.number().positive(),
        customer_note: vine.string().trim().maxLength(2000).optional().nullable(),
        lines: vine.array(lineShape).minLength(1),
    }),
);

export const adminOrderUpdateValidator = vine.compile(
    vine.object({
        customer_note: vine.string().trim().maxLength(2000).optional().nullable(),
        billing_email: vine.string().trim().email().maxLength(254).optional().nullable(),
    }),
);

export const adminOrderStatusValidator = vine.compile(
    vine.object({
        to_status: vine.enum(ORDER_STATUS_VALUES as unknown as readonly string[]),
        reason: vine.string().trim().maxLength(1000).optional().nullable(),
    }),
);

export const adminOrderBatchValidator = vine.compile(
    vine.object({
        delete: vine.array(vine.number().positive()).optional(),
        update: vine
            .array(
                vine.object({
                    id: vine.number().positive(),
                    customer_note: vine.string().trim().maxLength(2000).optional().nullable(),
                    billing_email: vine.string().trim().email().maxLength(254).optional().nullable(),
                }),
            )
            .optional(),
    }),
);

/** Address PATCH — billing accepts email, shipping accepts the customer-provided note instead. */
export const adminOrderAddressUpdateValidator = vine.compile(
    vine.object({
        first_name: vine.string().trim().minLength(1).maxLength(80),
        last_name: vine.string().trim().minLength(1).maxLength(80),
        company: vine.string().trim().maxLength(200).optional().nullable(),
        address_line_1: vine.string().trim().minLength(1).maxLength(255),
        address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
        city: vine.string().trim().minLength(1).maxLength(120),
        region_id: vine.number().positive().optional().nullable(),
        region_text: vine.string().trim().maxLength(200).optional().nullable(),
        postcode: vine.string().trim().maxLength(20).optional().nullable(),
        country: vine.string().trim().fixedLength(2),
        phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
        email: vine.string().trim().email().maxLength(254).optional().nullable(),
        national_id: vine.string().trim().maxLength(20).optional().nullable(),
        customer_note: vine.string().trim().maxLength(2000).optional().nullable(),
    }),
);

export const adminOrderLineItemCreateValidator = vine.compile(
    vine.object({
        product_id: vine.number().positive(),
        variation_id: vine.number().positive().optional().nullable(),
        quantity: vine.number().positive().max(10_000),
        price_override_minor: vine.number().min(0).optional().nullable(),
    }),
);

export const adminOrderLineItemUpdateValidator = vine.compile(
    vine.object({
        quantity: vine.number().positive().max(10_000).optional(),
        price_override_minor: vine.number().min(0).optional().nullable(),
        name: vine.string().trim().minLength(1).maxLength(255).optional(),
    }),
);

export const adminOrderFeeCreateValidator = vine.compile(
    vine.object({
        title: vine.string().trim().minLength(1).maxLength(255),
        amount_minor: vine.number().min(0),
        taxable: vine.boolean().optional(),
        tax_class_id: vine.number().positive().optional().nullable(),
    }),
);

export const adminOrderShippingLineCreateValidator = vine.compile(
    vine.object({
        method_code: vine.string().trim().minLength(1).maxLength(80),
        title: vine.string().trim().minLength(1).maxLength(255),
        total_minor: vine.number().min(0),
        tax_class_id: vine.number().positive().optional().nullable(),
    }),
);

export const adminOrderShippingLineUpdateValidator = vine.compile(
    vine.object({
        method_code: vine.string().trim().minLength(1).maxLength(80).optional(),
        title: vine.string().trim().minLength(1).maxLength(255).optional(),
        total_minor: vine.number().min(0).optional(),
        tax_class_id: vine.number().positive().optional().nullable(),
    }),
);

export const adminOrderCouponApplyValidator = vine.compile(
    vine.object({
        code: vine.string().trim().minLength(1).maxLength(80),
    }),
);

export const adminOrderHeaderUpdateValidator = vine.compile(
    vine.object({
        created_at: vine.string().trim().optional(),
        customer_id: vine.number().positive().optional().nullable(),
        billing_email: vine.string().trim().email().maxLength(254).optional().nullable(),
        is_locked: vine.boolean().optional(),
    }),
);

export const adminOrderRecalculateValidator = vine.compile(
    vine.object({
        preview: vine.boolean().optional(),
    }),
);

export const adminOrderMetaUpsertValidator = vine.compile(
    vine.object({
        key: vine
            .string()
            .trim()
            .minLength(1)
            .maxLength(191)
            .regex(/^[A-Za-z0-9_؀-ۿ.-]+$/u),
        value: vine.string().maxLength(65_535).optional(),
    }),
);
