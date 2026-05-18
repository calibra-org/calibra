import { Exception } from "@adonisjs/core/exceptions";

import {
    type AddressExtensionPayload,
    type AddressField,
    type AddressValidationContext,
    type CountryAddressRules,
    defaultValidationContext,
    rulesFor,
} from "#services/country_address_rules/index";

export interface AddressInput {
    first_name?: string | null;
    last_name?: string | null;
    address_line_1?: string | null;
    city?: string | null;
    region_id?: number | bigint | string | null;
    region_text?: string | null;
    postcode?: string | null;
    country: string;
    phone?: string | null;
    iran_extension?: AddressExtensionPayload | null;
}

export interface CountryValidationError {
    field: string;
    rule: string;
    message: string;
}

/**
 * Runs the per-country rules from the registry against an already-VineJS-validated payload. Returns
 * a list of errors (empty = success); the controller turns that into a 422 with the usual envelope.
 * Kept as a thin orchestrator so adding a new country is purely a new rules file under
 * `country_address_rules/`.
 */
export async function validateAddressForCountry(
    payload: AddressInput,
    ctx: AddressValidationContext = defaultValidationContext,
): Promise<CountryValidationError[]> {
    const errors: CountryValidationError[] = [];
    const rules: CountryAddressRules = rulesFor(payload.country);

    for (const field of rules.requiredFields) {
        if (!isPresent(payload, field)) {
            errors.push({
                field,
                rule: "required",
                message: `${field} is required for country ${payload.country}`,
            });
        }
    }

    if (rules.postcodePattern && payload.postcode && !rules.postcodePattern.test(payload.postcode)) {
        errors.push({
            field: "postcode",
            rule: "format",
            message: `postcode does not match pattern for country ${payload.country}`,
        });
    }

    if (rules.requiresRegion && (payload.region_id === undefined || payload.region_id === null)) {
        errors.push({
            field: "region_id",
            rule: "required",
            message: `region_id is required for country ${payload.country}`,
        });
    }

    if (rules.validateRegion && payload.region_id !== null && payload.region_id !== undefined) {
        const ok = await rules.validateRegion(payload.region_id, ctx);
        if (!ok) {
            errors.push({
                field: "region_id",
                rule: "country_mismatch",
                message: `region_id does not belong to country ${payload.country}`,
            });
        }
    }

    if (rules.extensionValidator) {
        const result = await rules.extensionValidator(payload.iran_extension ?? null);
        if (!result.ok) {
            errors.push({
                field: result.field,
                rule: result.reason,
                message: `${result.field} failed ${result.reason} check`,
            });
        }
    }

    return errors;
}

function isPresent(payload: AddressInput, field: AddressField): boolean {
    const value = (payload as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
}

/**
 * Throw helper for controllers — converts the country-rules errors into the standard 422 envelope
 * VineJS already uses, so client code only ever sees one shape.
 */
export function throwIfErrors(errors: CountryValidationError[]): void {
    if (errors.length === 0) return;
    const error = new Exception("Address failed country-specific validation", {
        code: "E_VALIDATION_ERROR",
        status: 422,
    });
    Object.defineProperty(error, "messages", {
        value: errors.map((e) => ({ field: e.field, rule: e.rule, message: e.message })),
    });
    throw error;
}
