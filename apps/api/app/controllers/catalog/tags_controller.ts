import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import ProductTag from "#models/product_tag";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { collection } from "#transformers/api_envelope";
import ProductTagTransformer from "#transformers/product_tag_transformer";

export default class TagsController {
    /**
     * `GET /api/v1/tags` — list product tags with their localized name + slug. 30m TTL because
     * tag content changes rarely; broad-tag invalidation refreshes on the next admin write.
     */
    async index(ctx: HttpContext) {
        const locale = ctx.i18n.locale;
        return cache.getOrSet({
            key: CacheKeys.catalog.tags(locale),
            ttl: "30m",
            tags: [CacheTags.catalogTaxonomy],
            factory: async () => {
                const rows = await ProductTag.query().preload("translations").orderBy("menu_order", "asc").orderBy("id", "asc");
                return collection(ProductTagTransformer.transform(rows, locale));
            },
        });
    }
}
