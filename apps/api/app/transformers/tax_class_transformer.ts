import { BaseTransformer } from "@adonisjs/core/transformers";

import type TaxClass from "#models/tax_class";

export default class TaxClassTransformer extends BaseTransformer<TaxClass> {
    toObject() {
        const t = this.resource;
        return {
            id: Number(t.id),
            slug: t.slug,
            name: t.name,
        };
    }

    forAdmin() {
        const t = this.resource;
        return {
            ...this.toObject(),
            created_at: t.createdAt?.toISO(),
            updated_at: t.updatedAt?.toISO(),
        };
    }
}
