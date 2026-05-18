import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductTag from "#models/product_tag";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductTagTransformer extends BaseTransformer<ProductTag> {
    constructor(
        resource: ProductTag,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const t = this.resource;
        const translation = pickTranslation(t.translations, this.locale);
        return {
            id: Number(t.id),
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
            attributes: t.attributes ?? {},
            created_at: t.createdAt?.toISO(),
            updated_at: t.updatedAt?.toISO(),
        };
    }
}
