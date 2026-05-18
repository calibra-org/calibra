import vine from "@vinejs/vine";

const ATTRIBUTE_TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    name: vine.string().trim().minLength(1).maxLength(200),
});

const TERM_TRANSLATION_SCHEMA = vine.object({
    locale: vine.string().trim().minLength(2).maxLength(8),
    name: vine.string().trim().minLength(1).maxLength(200),
    slug: vine.string().trim().maxLength(240).optional(),
    description: vine.string().trim().maxLength(2000).nullable().optional(),
});

export const createAttributeValidator = vine.compile(
    vine.object({
        code: vine
            .string()
            .trim()
            .minLength(1)
            .maxLength(100)
            .regex(/^(?!pa_)[a-z0-9][a-z0-9-]*$/),
        order_by: vine.enum(["menu_order", "name", "id"]).optional(),
        has_archives: vine.boolean().optional(),
        translations: vine.array(ATTRIBUTE_TRANSLATION_SCHEMA).minLength(1),
    }),
);

export const updateAttributeValidator = vine.compile(
    vine.object({
        order_by: vine.enum(["menu_order", "name", "id"]).optional(),
        has_archives: vine.boolean().optional(),
        translations: vine.array(ATTRIBUTE_TRANSLATION_SCHEMA).optional(),
    }),
);

export const createAttributeTermValidator = vine.compile(
    vine.object({
        menu_order: vine.number().optional(),
        translations: vine.array(TERM_TRANSLATION_SCHEMA).minLength(1),
    }),
);

export const updateAttributeTermValidator = vine.compile(
    vine.object({
        menu_order: vine.number().optional(),
        translations: vine.array(TERM_TRANSLATION_SCHEMA).optional(),
    }),
);
