import vine from "@vinejs/vine";

import { ORDER_STATUS_VALUES } from "#enums/order_status";
import { adminOrdersView } from "#table_views/admin/orders";

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

/** Parses a comma-separated query value (`?country=IR,DE`) or repeated-key array into a clean string[]. */
const csvArray = <T extends string>() =>
    vine.any().transform((value): T[] => {
        if (value === undefined || value === null || value === "") return [];
        const arr = Array.isArray(value) ? value : String(value).split(",");
        return arr.map((v) => String(v).trim()).filter((v) => v.length > 0) as T[];
    });

/**
 * Wraps the unified {@link adminOrdersView}'s TableView schema with the endpoint's free-text
 * `q` search box (a multi-column ILIKE the runtime can't model per-field), the soft-delete
 * scope toggle (`trashed=true` flips the controller from `whereNull(deleted_at)` to
 * `whereNotNull(deleted_at)`), and the `country` multi-select (a `whereExists` against the
 * `order_addresses` billing row the v1 TableView runtime can't model as a column WHERE).
 * Everything else — status, customer_id, source, payment, created date filter — moves to the
 * TableView `filter[]` grammar. Strict mode: any other top-level query key returns 422.
 */
export const adminOrderListValidator = adminOrdersView.compileStrict({
    extras: {
        q: vine.string().trim().minLength(1).maxLength(120).optional(),
        trashed: vine.boolean().optional(),
        country: csvArray<string>().optional(),
    },
});

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
