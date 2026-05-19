import vine from "@vinejs/vine";

/**
 * Wire-shape validator for `POST /admin/orders/:order_id/refunds`. The body MUST contain either
 * `amount` (free refund) XOR `line_items[]` (per-line refund) — never both, never neither. The
 * XOR rule is checked in `refund_service.create` against the row state (outstanding amount + per
 * line remaining quantity), because the live state isn't available here at validation time.
 */
export const adminRefundCreateValidator = vine.compile(
    vine.object({
        amount_minor: vine.number().positive().optional(),
        line_items: vine
            .array(
                vine.object({
                    order_line_item_id: vine.number().positive(),
                    quantity: vine.number().positive().max(100_000),
                    refund_amount_minor: vine.number().min(0).optional(),
                    refund_tax_minor: vine.number().min(0).optional(),
                }),
            )
            .minLength(1)
            .optional(),
        reason: vine.string().trim().maxLength(2000).optional().nullable(),
        restock_requested: vine.boolean().optional(),
    }),
);

export const adminRefundListValidator = vine.compile(
    vine.object({
        page: vine.number().positive().optional(),
        perPage: vine.number().positive().max(100).optional(),
    }),
);
