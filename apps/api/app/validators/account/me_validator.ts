import vine from "@vinejs/vine";

/**
 * `email` is deliberately omitted — changing email requires a re-verification flow not exposed
 * through this endpoint. The validator silently drops any submitted email so the controller
 * cannot accidentally persist it from a copy/paste mistake on the client.
 */
const iranExtensionShape = vine.object({
    national_id: vine
        .string()
        .trim()
        .fixedLength(10)
        .regex(/^\d{10}$/)
        .optional()
        .nullable(),
    corporate_national_id: vine
        .string()
        .trim()
        .fixedLength(11)
        .regex(/^\d{11}$/)
        .optional()
        .nullable(),
    economic_code: vine
        .string()
        .trim()
        .regex(/^\d{12}$/)
        .optional()
        .nullable(),
    legal_company_name_fa: vine.string().trim().maxLength(200).optional().nullable(),
    vat_taxpayer_status: vine.string().trim().maxLength(20).optional().nullable(),
});

export const meUpdateValidator = vine.compile(
    vine.object({
        first_name: vine.string().trim().minLength(1).maxLength(80).optional(),
        last_name: vine.string().trim().minLength(1).maxLength(80).optional(),
        phone: vine.string().trim().minLength(4).maxLength(32).optional().nullable(),
        country_default: vine.string().trim().fixedLength(2).optional(),
        locale: vine.string().trim().maxLength(8).optional(),
        /**
         * Iran-specific fiscal extension. Omit to leave the existing `customer_iran_profiles` row
         * unchanged, pass a fields object to upsert, or pass `null` to clear (the controller
         * treats `null` as a delete intent).
         */
        iran_extension: iranExtensionShape.optional().nullable(),
    }),
);
