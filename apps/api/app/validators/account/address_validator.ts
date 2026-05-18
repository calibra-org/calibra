import vine from "@vinejs/vine";

/**
 * Iran-extension payload shape, declared once and reused on create + update. The schema only
 * checks formats; the checksum check for `national_id` runs inside the country-rules service so
 * the validator stays country-agnostic.
 */
const iranExtensionShape = vine.object({
    national_id: vine.string().trim().fixedLength(10).regex(/^\d{10}$/).optional().nullable(),
    corporate_national_id: vine
        .string()
        .trim()
        .fixedLength(11)
        .regex(/^\d{11}$/)
        .optional()
        .nullable(),
    economic_code: vine.string().trim().regex(/^\d{12}$/).optional().nullable(),
    legal_company_name_fa: vine.string().trim().maxLength(200).optional().nullable(),
    vat_taxpayer_status: vine.string().trim().maxLength(20).optional().nullable(),
});

/**
 * Schema-level checks only. The country-aware `requiredFields`, postcode pattern, region/extension
 * rules are applied as a second pass in `applyCountryRules()` (called from the controller) — that
 * pass uses the `country_address_rules` registry and is the single place country-specific logic
 * lives.
 */
export const addressCreateValidator = vine.compile(
    vine.object({
        kind: vine.enum(["billing", "shipping", "both"]),
        label: vine.string().trim().maxLength(80).optional().nullable(),
        first_name: vine.string().trim().minLength(1).maxLength(80),
        last_name: vine.string().trim().minLength(1).maxLength(80),
        company: vine.string().trim().maxLength(200).optional().nullable(),
        address_line_1: vine.string().trim().minLength(1).maxLength(255),
        address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
        city: vine.string().trim().minLength(1).maxLength(120),
        region_id: vine.number().positive().optional().nullable(),
        region_text: vine.string().trim().maxLength(200).optional().nullable(),
        postcode: vine.string().trim().maxLength(20).optional().nullable(),
        country: vine.string().trim().fixedLength(2),
        phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
        is_default: vine.boolean().optional(),
        iran_extension: iranExtensionShape.optional().nullable(),
    }),
);

/**
 * PATCH variant — every commerce field is optional, but `country` stays required so we know which
 * country's rules to apply on the update. Kind cannot be patched (would break the partial unique
 * default-per-kind index in unexpected ways); delete and recreate to change kind.
 */
export const addressUpdateValidator = vine.compile(
    vine.object({
        label: vine.string().trim().maxLength(80).optional().nullable(),
        first_name: vine.string().trim().minLength(1).maxLength(80).optional(),
        last_name: vine.string().trim().minLength(1).maxLength(80).optional(),
        company: vine.string().trim().maxLength(200).optional().nullable(),
        address_line_1: vine.string().trim().minLength(1).maxLength(255).optional(),
        address_line_2: vine.string().trim().maxLength(255).optional().nullable(),
        city: vine.string().trim().minLength(1).maxLength(120).optional(),
        region_id: vine.number().positive().optional().nullable(),
        region_text: vine.string().trim().maxLength(200).optional().nullable(),
        postcode: vine.string().trim().maxLength(20).optional().nullable(),
        country: vine.string().trim().fixedLength(2),
        phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
        is_default: vine.boolean().optional(),
        iran_extension: iranExtensionShape.optional().nullable(),
    }),
);

export type AddressPayload = Awaited<ReturnType<typeof addressCreateValidator.validate>>;
export type AddressUpdatePayload = Awaited<ReturnType<typeof addressUpdateValidator.validate>>;
