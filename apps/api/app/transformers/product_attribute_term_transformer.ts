import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductAttributeTerm from "#models/product_attribute_term";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductAttributeTermTransformer extends BaseTransformer<ProductAttributeTerm> {
    constructor(
        resource: ProductAttributeTerm,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const t = this.resource;
        const translation = pickTranslation(t.translations, this.locale);
        return {
            id: Number(t.id),
            attribute_id: Number(t.attributeId),
            menu_order: t.menuOrder,
            name: translation?.name ?? null,
            slug: translation?.slug ?? null,
            description: translation?.description ?? null,
            locale: translation?.locale ?? this.locale,
        };
    }

    forAdmin() {
        const t = this.resource;
        return {
            ...this.toObject(),
            translations: (t.translations ?? []).map((row) => ({
                locale: row.locale,
                name: row.name,
                slug: row.slug,
                description: row.description,
            })),
            created_at: t.createdAt?.toISO(),
            updated_at: t.updatedAt?.toISO(),
        };
    }
}
