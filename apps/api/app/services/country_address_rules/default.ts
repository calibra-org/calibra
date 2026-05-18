import type { CountryAddressRules } from "./index.js";

/**
 * Catch-all rules for countries we don't have a dedicated file for. Permissive on purpose: the
 * universal minimum is a name + a street line + a city + a country code. Postcode is left free-form
 * because every country has different rules (US 5/9 digits, UK alphanumeric, Hong Kong has none),
 * and we'd rather accept a quirky valid postcode than reject one with a bad regex.
 */
export const defaultRules: CountryAddressRules = {
    country: "*",
    requiredFields: ["first_name", "last_name", "address_line_1", "city", "country"],
    postcodePattern: null,
    requiresRegion: false,
    fieldMetadata: {
        postcode: { labelKey: "address.fields.postcode.label.default" },
        region_id: { labelKey: "address.fields.region.label.default" },
        region_text: { labelKey: "address.fields.region_text.label.default" },
    },
};
