import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductShippingClass from "#models/product_shipping_class";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductShippingClassTransformer extends BaseTransformer<ProductShippingClass> {
    constructor(
        resource: ProductShippingClass,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const s = this.resource;
        const translation = pickTranslation(s.translations, this.locale);
        return {
            id: Number(s.id),
            slug: s.slug,
            menu_order: s.menuOrder,
            name: translation?.name ?? s.slug,
            description: translation?.description ?? null,
            locale: translation?.locale ?? this.locale,
        };
    }

    forAdmin() {
        const s = this.resource;
        return {
            ...this.toObject(),
            translations: (s.translations ?? []).map((row) => ({
                locale: row.locale,
                name: row.name,
                description: row.description,
            })),
            created_at: s.createdAt?.toISO(),
            updated_at: s.updatedAt?.toISO(),
        };
    }
}
