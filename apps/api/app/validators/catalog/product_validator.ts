import vine from "@vinejs/vine";

const TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    name: vine.string().trim().minLength(1).maxLength(300),
    slug: vine.string().trim().minLength(1).maxLength(320).optional(),
    description: vine.string().trim().maxLength(20000).nullable().optional(),
    short_description: vine.string().trim().maxLength(2000).nullable().optional(),
    purchase_note: vine.string().trim().maxLength(2000).nullable().optional(),
    external_button_text: vine.string().trim().maxLength(120).nullable().optional(),
});

export const createProductValidator = vine.compile(
    vine.object({
        type: vine.enum(["simple", "variable", "grouped", "external"]).optional(),
        sku: vine.string().trim().maxLength(100).nullable().optional(),
        status: vine.enum(["draft", "publish", "private", "pending"]).optional(),
        catalog_visibility: vine.enum(["visible", "catalog", "search", "hidden"]).optional(),
        featured: vine.boolean().optional(),
        virtual: vine.boolean().optional(),
        downloadable: vine.boolean().optional(),
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
        tax_class_id: vine.number().nullable().optional(),
        tax_status: vine.enum(["taxable", "shipping", "none"]).optional(),
        shipping_class_id: vine.number().nullable().optional(),
        weight_grams: vine.number().min(0).nullable().optional(),
        length_mm: vine.number().min(0).nullable().optional(),
        width_mm: vine.number().min(0).nullable().optional(),
        height_mm: vine.number().min(0).nullable().optional(),
        sold_individually: vine.boolean().optional(),
        reviews_allowed: vine.boolean().optional(),
        external_url: vine.string().trim().url().maxLength(1024).nullable().optional(),
        menu_order: vine.number().optional(),
        attributes: vine.record(vine.any()).optional(),
        translations: vine.array(TRANSLATION_SCHEMA).minLength(1),
        category_ids: vine.array(vine.number()).optional(),
        tag_ids: vine.array(vine.number()).optional(),
        brand_ids: vine.array(vine.number()).optional(),
        image_media_ids: vine.array(vine.number()).optional(),
    }),
);

export const updateProductValidator = vine.compile(
    vine.object({
        type: vine.enum(["simple", "variable", "grouped", "external"]).optional(),
        sku: vine.string().trim().maxLength(100).nullable().optional(),
        status: vine.enum(["draft", "publish", "private", "pending"]).optional(),
        catalog_visibility: vine.enum(["visible", "catalog", "search", "hidden"]).optional(),
        featured: vine.boolean().optional(),
        virtual: vine.boolean().optional(),
        downloadable: vine.boolean().optional(),
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
        tax_class_id: vine.number().nullable().optional(),
        tax_status: vine.enum(["taxable", "shipping", "none"]).optional(),
        shipping_class_id: vine.number().nullable().optional(),
        weight_grams: vine.number().min(0).nullable().optional(),
        length_mm: vine.number().min(0).nullable().optional(),
        width_mm: vine.number().min(0).nullable().optional(),
        height_mm: vine.number().min(0).nullable().optional(),
        sold_individually: vine.boolean().optional(),
        reviews_allowed: vine.boolean().optional(),
        external_url: vine.string().trim().url().maxLength(1024).nullable().optional(),
        menu_order: vine.number().optional(),
        attributes: vine.record(vine.any()).optional(),
        translations: vine.array(TRANSLATION_SCHEMA).optional(),
        category_ids: vine.array(vine.number()).optional(),
        tag_ids: vine.array(vine.number()).optional(),
        brand_ids: vine.array(vine.number()).optional(),
        image_media_ids: vine.array(vine.number()).optional(),
    }),
);

export const batchProductsValidator = vine.compile(
    vine.object({
        create: vine.array(vine.any()).optional(),
        update: vine
            .array(
                vine.object({
                    id: vine.number(),
                }),
            )
            .optional(),
        delete: vine.array(vine.number()).optional(),
    }),
);
