import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import ProductBrand from "#models/product_brand";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { collection } from "#transformers/api_envelope";
import ProductBrandTransformer from "#transformers/product_brand_transformer";

export default class BrandsController {
    /**
     * `GET /api/v1/brands` — list brand entries with localized name + slug. 30m TTL because
     * brands change rarely; broad-tag invalidation refreshes on the next admin write.
     */
    async index(ctx: HttpContext) {
        const locale = ctx.i18n.locale;
        return cache.getOrSet({
            key: CacheKeys.catalog.brands(locale),
            ttl: "30m",
            tags: [CacheTags.catalogTaxonomy],
            factory: async () => {
                const rows = await ProductBrand.query().preload("translations").orderBy("menu_order", "asc").orderBy("id", "asc");
                return collection(ProductBrandTransformer.transform(rows, locale));
            },
        });
    }
}
