import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductBrand from "#models/product_brand";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductBrandTransformer extends BaseTransformer<ProductBrand> {
    constructor(
        resource: ProductBrand,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const b = this.resource;
        const translation = pickTranslation(b.translations, this.locale);
        return {
            id: Number(b.id),
            image_media_id: b.imageMediaId === null ? null : Number(b.imageMediaId),
            menu_order: b.menuOrder,
            name: translation?.name ?? null,
            slug: translation?.slug ?? null,
            description: translation?.description ?? null,
            locale: translation?.locale ?? this.locale,
        };
    }

    forAdmin() {
        const b = this.resource;
        return {
            ...this.toObject(),
            translations: (b.translations ?? []).map((row) => ({
                locale: row.locale,
                name: row.name,
                slug: row.slug,
                description: row.description,
            })),
            attributes: b.attributes ?? {},
            created_at: b.createdAt?.toISO(),
            updated_at: b.updatedAt?.toISO(),
        };
    }
}
