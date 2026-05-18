import vine from "@vinejs/vine";

const TAXONOMY_TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    name: vine.string().trim().minLength(1).maxLength(200),
    slug: vine.string().trim().maxLength(240).optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
});

export const createCategoryValidator = vine.compile(
    vine.object({
        parent_id: vine.number().nullable().optional(),
        display: vine.enum(["default", "products", "subcategories", "both"]).optional(),
        image_media_id: vine.number().nullable().optional(),
        menu_order: vine.number().optional(),
        translations: vine.array(TAXONOMY_TRANSLATION_SCHEMA).minLength(1),
    }),
);

export const updateCategoryValidator = vine.compile(
    vine.object({
        parent_id: vine.number().nullable().optional(),
        display: vine.enum(["default", "products", "subcategories", "both"]).optional(),
        image_media_id: vine.number().nullable().optional(),
        menu_order: vine.number().optional(),
        translations: vine.array(TAXONOMY_TRANSLATION_SCHEMA).optional(),
    }),
);

export const createTagValidator = vine.compile(
    vine.object({
        menu_order: vine.number().optional(),
        translations: vine.array(TAXONOMY_TRANSLATION_SCHEMA).minLength(1),
    }),
);

export const updateTagValidator = vine.compile(
    vine.object({
        menu_order: vine.number().optional(),
        translations: vine.array(TAXONOMY_TRANSLATION_SCHEMA).optional(),
    }),
);

export const createBrandValidator = vine.compile(
    vine.object({
        image_media_id: vine.number().nullable().optional(),
        menu_order: vine.number().optional(),
        translations: vine.array(TAXONOMY_TRANSLATION_SCHEMA).minLength(1),
    }),
);

export const updateBrandValidator = vine.compile(
    vine.object({
        image_media_id: vine.number().nullable().optional(),
        menu_order: vine.number().optional(),
        translations: vine.array(TAXONOMY_TRANSLATION_SCHEMA).optional(),
    }),
);

const SHIPPING_TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    name: vine.string().trim().minLength(1).maxLength(200),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
});

export const createShippingClassValidator = vine.compile(
    vine.object({
        slug: vine.string().trim().minLength(1).maxLength(100),
        menu_order: vine.number().optional(),
        translations: vine.array(SHIPPING_TRANSLATION_SCHEMA).minLength(1),
    }),
);

export const updateShippingClassValidator = vine.compile(
    vine.object({
        slug: vine.string().trim().minLength(1).maxLength(100).optional(),
        menu_order: vine.number().optional(),
        translations: vine.array(SHIPPING_TRANSLATION_SCHEMA).optional(),
    }),
);
