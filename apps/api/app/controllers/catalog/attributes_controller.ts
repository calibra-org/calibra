import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import ProductAttribute from "#models/product_attribute";
import ProductAttributeTerm from "#models/product_attribute_term";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { collection } from "#transformers/api_envelope";
import ProductAttributeTermTransformer from "#transformers/product_attribute_term_transformer";
import ProductAttributeTransformer from "#transformers/product_attribute_transformer";

export default class AttributesController {
    /** `GET /api/v1/attributes` — list attributes (color, size, etc.) with localized names. */
    async index(ctx: HttpContext) {
        const locale = ctx.i18n.locale;
        return cache.getOrSet({
            key: CacheKeys.catalog.attributes(locale),
            ttl: "30m",
            tags: [CacheTags.catalogTaxonomy],
            factory: async () => {
                const rows = await ProductAttribute.query().preload("translations").orderBy("id", "asc");
                return collection(ProductAttributeTransformer.transform(rows, locale));
            },
        });
    }

    /** `GET /api/v1/attributes/:id/terms` — terms for an attribute. */
    async terms(ctx: HttpContext) {
        const locale = ctx.i18n.locale;
        const attributeId = Number(ctx.params.id);

        const attribute = await ProductAttribute.find(attributeId);
        if (!attribute) {
            return ctx.response.status(404).json({ error: "attribute_not_found" });
        }

        return cache.getOrSet({
            key: CacheKeys.catalog.attributeTerms(attribute.id, locale),
            ttl: "30m",
            tags: [CacheTags.catalogTaxonomy],
            factory: async () => {
                const terms = await ProductAttributeTerm.query()
                    .where("attribute_id", String(attribute.id))
                    .preload("translations")
                    .orderBy("menu_order", "asc")
                    .orderBy("id", "asc");
                return collection(ProductAttributeTermTransformer.transform(terms, locale));
            },
        });
    }
}
