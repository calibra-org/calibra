import Region from "#models/region";

import { defaultRules } from "./default.js";
import { ir } from "./ir.js";

export type AddressField =
    | "first_name"
    | "last_name"
    | "company"
    | "address_line_1"
    | "address_line_2"
    | "city"
    | "region_id"
    | "region_text"
    | "postcode"
    | "country"
    | "phone";

export interface AddressExtensionPayload {
    national_id?: string | null;
    corporate_national_id?: string | null;
    economic_code?: string | null;
    legal_company_name_fa?: string | null;
    vat_taxpayer_status?: string | null;
}

export interface AddressValidationContext {
    /**
     * Wraps `Region.find()` so country-rules files don't have to import the model directly — keeps
     * the rules layer free of ORM detail and easier to swap with a stub in tests.
     */
    lookupRegion(regionId: number | bigint | string): Promise<{ id: number | bigint; countryCode: string } | null>;
}

export interface FieldMetadata {
    labelKey: string;
    pattern?: string;
    inputMode?: "numeric" | "tel" | "decimal";
    valuesEndpoint?: string;
    optional?: boolean;
}

export interface CountryAddressRules {
    country: string;
    requiredFields: ReadonlyArray<AddressField>;
    postcodePattern: RegExp | null;
    requiresRegion: boolean;
    fieldMetadata: Record<string, FieldMetadata>;
    validateRegion?(
        regionId: number | bigint | string,
        ctx: AddressValidationContext,
    ): Promise<boolean>;
    extensionValidator?(
        extension: AddressExtensionPayload | null | undefined,
    ): Promise<{ ok: true } | { ok: false; field: string; reason: string }>;
}

const REGISTRY: Record<string, CountryAddressRules> = {
    IR: ir,
};

/**
 * Pattern 2: per-country rules in a flat registry, plus a permissive default. Controllers and
 * validators call `rulesFor(country)` once and read the resulting object — there are deliberately
 * no `if country === 'IR'` branches outside the per-country files.
 */
export function rulesFor(country: string): CountryAddressRules {
    if (typeof country !== "string" || country.length !== 2) {
        return defaultRules;
    }
    return REGISTRY[country.toUpperCase()] ?? defaultRules;
}

/**
 * Default lookup context backed by Lucid. Tests can substitute their own to avoid the round-trip.
 */
export const defaultValidationContext: AddressValidationContext = {
    async lookupRegion(regionId) {
        const row = await Region.find(regionId);
        if (!row) return null;
        return { id: row.id, countryCode: row.countryCode };
    },
};
