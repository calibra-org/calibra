import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductAttribute from "#models/product_attribute";
import { pickTranslation } from "#transformers/i18n_helpers";

export default class ProductAttributeTransformer extends BaseTransformer<ProductAttribute> {
    constructor(
        resource: ProductAttribute,
        protected locale: string = "fa",
    ) {
        super(resource);
    }

    toObject() {
        const a = this.resource;
        const translation = pickTranslation(a.translations, this.locale);
        return {
            id: Number(a.id),
            code: a.code,
            order_by: a.orderBy,
            has_archives: a.hasArchives,
            name: translation?.name ?? a.code,
            locale: translation?.locale ?? this.locale,
        };
    }

    forAdmin() {
        const a = this.resource;
        return {
            ...this.toObject(),
            translations: (a.translations ?? []).map((row) => ({ locale: row.locale, name: row.name })),
            created_at: a.createdAt?.toISO(),
            updated_at: a.updatedAt?.toISO(),
        };
    }
}
