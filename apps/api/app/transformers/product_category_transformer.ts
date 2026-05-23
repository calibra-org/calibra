import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductCategory from "#models/product_category";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductCategoryTransformer extends BaseTransformer<ProductCategory> {
    constructor(
        resource: ProductCategory,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const c = this.resource;
        const translation = pickTranslation(c.translations, this.locale);
        return {
            id: Number(c.id),
            parent_id: c.parentId === null ? null : Number(c.parentId),
            display: c.display,
            image_media_id: c.imageMediaId === null ? null : Number(c.imageMediaId),
            image_url: c.image?.url ?? null,
            menu_order: c.menuOrder,
            name: translation?.name ?? null,
            slug: translation?.slug ?? null,
            description: translation?.description ?? null,
            locale: translation?.locale ?? this.locale,
        };
    }

    forAdmin() {
        const c = this.resource;
        return {
            ...this.toObject(),
            translations: (c.translations ?? []).map((row) => ({
                locale: row.locale,
                name: row.name,
                slug: row.slug,
                description: row.description,
            })),
            attributes: c.attributes ?? {},
            created_at: c.createdAt?.toISO(),
            updated_at: c.updatedAt?.toISO(),
        };
    }
}
