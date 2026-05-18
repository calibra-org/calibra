import vine from "@vinejs/vine";

/**
 * Storefront `POST /api/v1/payment/init` body. The controller looks up the order by
 * `order_key` (opaque 32-char hex) so the route is safe for guest pay-link consumption.
 */
export const paymentInitValidator = vine.compile(
    vine.object({
        order_key: vine.string().trim().minLength(8).maxLength(64),
    }),
);
