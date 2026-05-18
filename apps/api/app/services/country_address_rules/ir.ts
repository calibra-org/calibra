import type { AddressExtensionPayload, AddressValidationContext, CountryAddressRules } from "./index.js";
import nationalIdService from "#services/national_id_service";

/**
 * Iran-specific address rules. Postcode is the unambiguous 10-digit form (no dash). Region is
 * required and must reference a regions row whose `country_code` is `IR` — the index registry
 * resolves the lookup at validation time so we don't bind to an ORM model here.
 *
 * The `extensionValidator` only fires when the request carries an `iran_extension` payload, so
 * customers/addresses that don't need fiscal identifiers never hit checksum validation.
 */
export const ir: CountryAddressRules = {
    country: "IR",
    requiredFields: ["first_name", "last_name", "address_line_1", "city", "region_id", "postcode", "phone"],
    postcodePattern: /^\d{10}$/,
    requiresRegion: true,
    fieldMetadata: {
        postcode: {
            labelKey: "address.fields.postcode.label.IR",
            pattern: "^\\d{10}$",
            inputMode: "numeric",
        },
        region_id: {
            labelKey: "address.fields.region.label.IR",
            valuesEndpoint: "/api/v1/regions?country=IR",
        },
        iran_extension: {
            labelKey: "address.fields.iran_extension.label.IR",
            optional: true,
        },
    },
    async validateRegion(regionId: number | bigint | string, ctx: AddressValidationContext) {
        const row = await ctx.lookupRegion(regionId);
        return Boolean(row) && row?.countryCode === "IR";
    },
    async extensionValidator(extension: AddressExtensionPayload) {
        if (!extension) return { ok: true } as const;
        if (extension.national_id !== undefined && extension.national_id !== null) {
            if (!nationalIdService.validate(extension.national_id)) {
                return { ok: false, field: "iran_extension.national_id", reason: "checksum" } as const;
            }
        }
        if (extension.corporate_national_id !== undefined && extension.corporate_national_id !== null) {
            if (!/^\d{11}$/.test(extension.corporate_national_id)) {
                return { ok: false, field: "iran_extension.corporate_national_id", reason: "format" } as const;
            }
        }
        if (extension.economic_code !== undefined && extension.economic_code !== null) {
            if (!/^\d{12}$/.test(extension.economic_code)) {
                return { ok: false, field: "iran_extension.economic_code", reason: "format" } as const;
            }
        }
        return { ok: true } as const;
    },
};
