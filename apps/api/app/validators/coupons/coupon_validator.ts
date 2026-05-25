import vine from "@vinejs/vine";

const DISCOUNT_TYPES = ["percent", "fixed_cart", "fixed_product", "free_shipping"] as const;
const STATUSES = ["active", "disabled"] as const;
const CONSTRAINT_MODES = ["include", "exclude"] as const;

/**
 * Common field block reused by both create and update validators. Optional everywhere; the
 * controller applies the partial update by only writing keys VineJS surfaced. Discount-type ↔
 * amount-column coherence (`percent` requires `amount_percent`, `fixed_*` require `amount_minor`)
 * is enforced by the DB CHECK constraint — duplicating the rule here would drift over time.
 */
const couponFields = {
    code: vine.string().trim().minLength(2).maxLength(64),
    discount_type: vine.enum(DISCOUNT_TYPES),
    amount_minor: vine.number().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    amount_percent: vine.number().min(0).max(100).nullable().optional(),
    starts_at: vine
        .date({ formats: { utc: true } })
        .nullable()
        .optional(),
    expires_at: vine
        .date({ formats: { utc: true } })
        .nullable()
        .optional(),
    individual_use: vine.boolean().optional(),
    exclude_sale_items: vine.boolean().optional(),
    minimum_amount: vine.number().min(0).nullable().optional(),
    maximum_amount: vine.number().min(0).nullable().optional(),
    usage_limit_global: vine.number().min(1).nullable().optional(),
    usage_limit_per_user: vine.number().min(1).nullable().optional(),
    limit_usage_to_x_items: vine.number().min(1).nullable().optional(),
    free_shipping: vine.boolean().optional(),
    status: vine.enum(STATUSES).optional(),
    translations: vine
        .array(
            vine.object({
                locale: vine.string().trim().minLength(2).maxLength(8),
                description: vine.string().trim().maxLength(2000).nullable().optional(),
            }),
        )
        .optional(),
    product_constraints: vine
        .array(
            vine.object({
                product_id: vine.number().positive(),
                mode: vine.enum(CONSTRAINT_MODES),
            }),
        )
        .optional(),
    category_constraints: vine
        .array(
            vine.object({
                category_id: vine.number().positive(),
                mode: vine.enum(CONSTRAINT_MODES),
            }),
        )
        .optional(),
    brand_constraints: vine
        .array(
            vine.object({
                brand_id: vine.number().positive(),
                mode: vine.enum(CONSTRAINT_MODES),
            }),
        )
        .optional(),
    email_restrictions: vine.array(vine.string().trim().minLength(3).maxLength(320)).optional(),
};

export const createCouponValidator = vine.compile(vine.object(couponFields));

export const updateCouponValidator = vine.compile(
    vine.object({
        ...couponFields,
        /** Code is immutable post-create — admins remove + recreate if they need to rename. */
        code: vine.string().trim().minLength(2).maxLength(64).optional(),
        discount_type: vine.enum(DISCOUNT_TYPES).optional(),
    }),
);

/**
 * `POST /admin/coupons/batch` — Woo-style triplet: arrays of creates, updates (each carrying its
 * own `id`), and deletes. Each branch validates independently so a single bad row doesn't tank a
 * mixed batch.
 */
export const batchCouponValidator = vine.compile(
    vine.object({
        create: vine.array(vine.object(couponFields)).optional(),
        update: vine
            .array(
                vine.object({
                    id: vine.number().positive(),
                    ...couponFields,
                    code: vine.string().trim().minLength(2).maxLength(64).optional(),
                    discount_type: vine.enum(DISCOUNT_TYPES).optional(),
                }),
            )
            .optional(),
        delete: vine.array(vine.number().positive()).optional(),
    }),
);
