import vine from "@vinejs/vine";

/**
 * `POST /api/v1/cart/coupons` — apply a coupon code to the current cart. Eligibility (status,
 * dates, constraints, limits) is checked by the discounter inside the controller; this schema only
 * validates the wire format. Length matches the validator on the admin create endpoint so neither
 * side accidentally accepts a code the other would reject.
 */
export const applyCouponValidator = vine.compile(
    vine.object({
        code: vine.string().trim().minLength(2).maxLength(64),
    }),
);
