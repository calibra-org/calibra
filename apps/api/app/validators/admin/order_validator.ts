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

export const adminOrderListValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
        status: vine.enum(ORDER_STATUS_VALUES as unknown as readonly string[]).optional(),
        customer_id: vine.number().positive().optional(),
        created_via: vine.enum(["checkout", "admin", "api", "import"]).optional(),
        search: vine.string().trim().minLength(1).maxLength(120).optional(),
        after: vine.string().trim().optional(),
        before: vine.string().trim().optional(),
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
