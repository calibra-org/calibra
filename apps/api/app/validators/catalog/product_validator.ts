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

const ATTRIBUTE_LINK_SCHEMA = vine.object({
    attribute_id: vine.number(),
    position: vine.number().min(0).optional(),
    visible: vine.boolean().optional(),
    used_for_variation: vine.boolean().optional(),
    term_ids: vine.array(vine.number()),
});

const DOWNLOAD_SCHEMA = vine.object({
    id: vine.number().optional(),
    media_id: vine.number(),
    file_label: vine.string().trim().minLength(1).maxLength(200),
    download_limit: vine.number().min(0).nullable().optional(),
    download_expiry_days: vine.number().min(0).nullable().optional(),
    position: vine.number().min(0).optional(),
});

const CUSTOM_ATTRIBUTE_SCHEMA = vine.object({
    id: vine.number().optional(),
    name: vine.string().trim().minLength(1).maxLength(200),
    values: vine.array(vine.string().trim().minLength(1).maxLength(200)).maxLength(200),
    position: vine.number().min(0).optional(),
    visible: vine.boolean().optional(),
});

export const createProductValidator = vine.compile(
    vine.object({
        type: vine.enum(["simple", "variable", "grouped", "external"]).optional(),
        sku: vine.string().trim().maxLength(100).nullable().optional(),
        gtin: vine.string().trim().maxLength(64).nullable().optional(),
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
        upsell_ids: vine.array(vine.number()).optional(),
        cross_sell_ids: vine.array(vine.number()).optional(),
        grouped_member_ids: vine.array(vine.number()).optional(),
        downloads: vine.array(DOWNLOAD_SCHEMA).optional(),
        pos_available: vine.boolean().optional(),
        attribute_links: vine.array(ATTRIBUTE_LINK_SCHEMA).optional(),
        custom_attributes: vine.array(CUSTOM_ATTRIBUTE_SCHEMA).maxLength(50).optional(),
        default_variation_id: vine.number().nullable().optional(),
    }),
);

export const updateProductValidator = vine.compile(
    vine.object({
        type: vine.enum(["simple", "variable", "grouped", "external"]).optional(),
        sku: vine.string().trim().maxLength(100).nullable().optional(),
        gtin: vine.string().trim().maxLength(64).nullable().optional(),
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
        upsell_ids: vine.array(vine.number()).optional(),
        cross_sell_ids: vine.array(vine.number()).optional(),
        grouped_member_ids: vine.array(vine.number()).optional(),
        downloads: vine.array(DOWNLOAD_SCHEMA).optional(),
        pos_available: vine.boolean().optional(),
        attribute_links: vine.array(ATTRIBUTE_LINK_SCHEMA).optional(),
        custom_attributes: vine.array(CUSTOM_ATTRIBUTE_SCHEMA).maxLength(50).optional(),
        default_variation_id: vine.number().nullable().optional(),
    }),
);

export const batchProductsValidator = vine.compile(
    vine.object({
        /**
         * Each `create` / `update` entry is re-validated inside the controller via
         * `createProductValidator` / `updateProductValidator` — keep these as `vine.any()` so
         * the outer batch validator doesn't strip the per-entry fields before they reach the
         * inner validator. The earlier object-with-just-`id` shape silently dropped every other
         * field, which is why bulk `catalog_visibility` / `featured` / `stock_status` toggles
         * looked like no-ops on the wire.
         */
        create: vine.array(vine.any()).optional(),
        update: vine.array(vine.any()).optional(),
        /**
         * Either `[1, 2, 3]` (soft-trash by id) or `[{ id, force?: true }, …]` (per-entry hard-
         * delete control). The controller pattern-matches on the shape, so accept either form.
         */
        delete: vine.array(vine.any()).optional(),
    }),
);

/** Bulk restore payload — `POST /admin/products/restore`. */
export const restoreProductsValidator = vine.compile(
    vine.object({
        ids: vine.array(vine.number()).minLength(1),
    }),
);

/** Slug availability check — `GET /admin/products/check-slug?slug=…&locale=…&excludeId=…`. */
export const checkSlugValidator = vine.compile(
    vine.object({
        slug: vine.string().trim().minLength(1).maxLength(320),
        locale: vine.string().trim().minLength(2).maxLength(8),
        excludeId: vine.number().optional(),
    }),
);
