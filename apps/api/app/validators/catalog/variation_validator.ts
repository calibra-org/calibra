import vine from "@vinejs/vine";

const VARIATION_TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    description: vine.string().trim().maxLength(20000).nullable().optional(),
});

const ATTRIBUTE_PIN_SCHEMA = vine.object({
    attribute_id: vine.number(),
    term_id: vine.number(),
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
        attributes: vine.record(vine.any()).optional(),
        translations: vine.array(VARIATION_TRANSLATION_SCHEMA).optional(),
        attribute_pins: vine.array(ATTRIBUTE_PIN_SCHEMA).optional(),
    }),
);

export const updateVariationValidator = createVariationValidator;
