import vine from "@vinejs/vine";

/**
 * Body for the admin "Quick test" panel. Synthetic cart shape — the test runner mirrors the
 * line-item / customer / shipping fields the cart-apply path consumes without writing anything
 * to the database.
 */
export const adminCouponTestValidator = vine.compile(
    vine.object({
        customer_id: vine.number().positive().nullable().optional(),
        email: vine.string().trim().email().nullable().optional(),
        line_items: vine
            .array(
                vine.object({
                    product_id: vine.number().positive(),
                    quantity: vine.number().positive(),
                    /** Snapshot price in minor units when the operator overrides what the catalog says. */
                    price_minor: vine.number().min(0).optional(),
                }),
            )
            .minLength(1),
        shipping_method_id: vine.number().positive().nullable().optional(),
        country: vine.string().trim().minLength(2).maxLength(2).optional(),
    }),
);
