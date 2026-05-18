import vine from "@vinejs/vine";

/**
 * `POST /api/v1/cart/items` — add a product (and optionally a specific variation) to the cart.
 * Cross-validation that requires DB lookups (product exists / variation belongs to product /
 * stock availability) runs inside the controller against the loaded models; this schema only
 * guards the wire format.
 */
export const addItemValidator = vine.compile(
    vine.object({
        product_id: vine.number().positive(),
        variation_id: vine.number().positive().optional().nullable(),
        quantity: vine.number().min(1).max(9999),
    }),
);

/**
 * `PATCH /api/v1/cart/items/:line_id` — set the line quantity. `0` is the documented signal to
 * remove the line, which the controller handles by calling the same delete path as DELETE.
 */
export const updateItemValidator = vine.compile(
    vine.object({
        quantity: vine.number().min(0).max(9999),
    }),
);

/**
 * `POST /api/v1/cart/customer` — set the derived address fields the cart uses for tax + shipping
 * calc. `region_id` is the country-agnostic FK to `regions` per Pattern 1; `region_text` is the
 * free-form fallback for countries we don't seed regions for. The country-specific postcode
 * pattern (Iran is `^\d{10}$`) is checked through the `country_address_rules` service in the
 * controller, so adding a new country doesn't reach into this schema.
 */
export const updateCustomerValidator = vine.compile(
    vine.object({
        country: vine.string().trim().fixedLength(2),
        region_id: vine.number().positive().optional().nullable(),
        region_text: vine.string().trim().maxLength(200).optional().nullable(),
        postcode: vine.string().trim().maxLength(20).optional().nullable(),
    }),
);

/**
 * `POST /api/v1/cart/shipping-rate` — pick one of the enumerated shipping options for the cart's
 * current address. Eligibility is re-checked in the controller against
 * {@link findEligibleRate} so the response always reflects the live state.
 */
export const selectShippingRateValidator = vine.compile(
    vine.object({
        shipping_zone_method_id: vine.number().positive(),
    }),
);
