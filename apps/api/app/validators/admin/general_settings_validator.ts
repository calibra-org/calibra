import vine from "@vinejs/vine";

/**
 * PATCH body for `PATCH /api/v1/admin/settings/general`. Every section and field is optional — the
 * controller writes only what changed (same-value writes are no-ops). Cross-field rules enforced in
 * the controller: `currency.display` must be an enabled currency, and `thousand_sep` must differ
 * from `decimal_sep` after the merge with current values.
 */
export const adminGeneralSettingsUpdateValidator = vine.compile(
    vine.object({
        store_address: vine
            .object({
                address_1: vine.string().trim().maxLength(255).optional(),
                address_2: vine.string().trim().maxLength(255).optional(),
                city: vine.string().trim().maxLength(120).optional(),
                state: vine.string().trim().maxLength(16).optional(),
                postcode: vine.string().trim().maxLength(20).optional(),
                country: vine.string().trim().maxLength(2).optional(),
            })
            .optional(),
        general_options: vine
            .object({
                selling_locations: vine.enum(["all", "all_except", "specific"]).optional(),
                selling_locations_specific: vine.array(vine.string().trim().maxLength(2)).optional(),
                selling_locations_excluded: vine.array(vine.string().trim().maxLength(2)).optional(),
                shipping_locations: vine.enum(["", "all", "specific", "disabled"]).optional(),
                shipping_locations_specific: vine.array(vine.string().trim().maxLength(2)).optional(),
                default_customer_location: vine.enum(["none", "base", "geolocation", "geolocation_ajax"]).optional(),
                address_autocomplete: vine.boolean().optional(),
            })
            .optional(),
        taxes_and_coupons: vine
            .object({
                taxes_enabled: vine.boolean().optional(),
                coupons_enabled: vine.boolean().optional(),
                calc_discounts_sequentially: vine.boolean().optional(),
            })
            .optional(),
        currency: vine
            .object({
                display: vine.string().trim().maxLength(8).optional(),
                position: vine.enum(["left", "right", "left_space", "right_space"]).optional(),
                thousand_sep: vine.string().minLength(1).maxLength(3).optional(),
                decimal_sep: vine.string().minLength(1).maxLength(3).optional(),
                num_decimals: vine.number().min(0).max(4).optional(),
            })
            .optional(),
    }),
);
