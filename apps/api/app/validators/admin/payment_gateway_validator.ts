import vine from "@vinejs/vine";

/**
 * Admin `GET /api/v1/admin/payment-gateways` list query. Single-page list — no pagination needed
 * for the < 10 rows we ship.
 */
export const adminPaymentGatewayListValidator = vine.compile(
    vine.object({
        enabled: vine.boolean().optional(),
    }),
);

/**
 * Admin `PATCH /api/v1/admin/payment-gateways/:id`. `settings` is a free-form object; the
 * controller merges (rather than replaces) the incoming object so admins can rotate one key at a
 * time without re-sending the full dictionary.
 */
export const adminPaymentGatewayUpdateValidator = vine.compile(
    vine.object({
        enabled: vine.boolean().optional(),
        ordering: vine.number().min(0).optional(),
        settings: vine.record(vine.any()).optional(),
        supports: vine.record(vine.any()).optional(),
    }),
);

export const adminPaymentAttemptListValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
        gateway_code: vine.string().trim().optional(),
        status: vine.string().trim().optional(),
        order_id: vine.number().positive().optional(),
    }),
);
