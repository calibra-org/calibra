import vine from "@vinejs/vine";

const VARIATION_TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    description: vine.string().trim().maxLength(20000).nullable().optional(),
});

const ATTRIBUTE_PIN_SCHEMA = vine.object({
    attribute_id: vine.number(),
    /** `null` represents "Any term" for the attribute. */
    term_id: vine.number().nullable(),
});

export const createVariationValidator = vine.compile(
    vine.object({
        sku: vine.string().trim().maxLength(100).nullable().optional(),
        regular_price: vine.number().min(0).nullable().optional(),
        sale_price: vine.number().min(0).nullable().optional(),
        sale_starts_at: vine
            .date({ formats: { utc: true } })
            .nullable()
            .optional(),
        sale_ends_at: vine
            .date({ formats: { utc: true } })
            .nullable()
            .optional(),
        weight_grams: vine.number().min(0).nullable().optional(),
        length_mm: vine.number().min(0).nullable().optional(),
        width_mm: vine.number().min(0).nullable().optional(),
        height_mm: vine.number().min(0).nullable().optional(),
        image_media_id: vine.number().nullable().optional(),
        virtual: vine.boolean().optional(),
        downloadable: vine.boolean().optional(),
        tax_class_id: vine.number().nullable().optional(),
        manage_stock_mode: vine.enum(["own", "parent"]).optional(),
        menu_order: vine.number().optional(),
        status: vine.enum(["draft", "active", "inactive", "archived"]).optional(),
        attributes: vine.record(vine.any()).optional(),
        translations: vine.array(VARIATION_TRANSLATION_SCHEMA).optional(),
        attribute_pins: vine.array(ATTRIBUTE_PIN_SCHEMA).optional(),
    }),
);

export const updateVariationValidator = createVariationValidator;

/**
 * Batch variations payload — `POST /admin/products/:product_id/variations/batch`. The outer
 * validator only checks shape; each create/update entry is re-validated by the per-row
 * validators inside the controller (same pattern as the products batch). Bare-numbers in
 * `delete` are variation ids.
 */
export const batchVariationsValidator = vine.compile(
    vine.object({
        create: vine.array(vine.any()).optional(),
        update: vine.array(vine.any()).optional(),
        delete: vine.array(vine.number()).optional(),
    }),
);
