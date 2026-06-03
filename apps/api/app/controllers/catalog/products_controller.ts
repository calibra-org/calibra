import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import Product from "#models/product";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { currentTenantId } from "#services/tenant_context";
import { collection, paginated, resource } from "#transformers/api_envelope";
import ProductTransformer from "#transformers/product_transformer";
import ProductVariationTransformer from "#transformers/product_variation_transformer";

/** Maps `orderby` query param to the column the storefront sorts by. Unknown values fall back. */
const SORT_COLUMNS: Record<string, string> = {
    menu_order: "menu_order",
    date: "created_at",
    price: "regular_price",
    title: "id",
};

export default class ProductsController {
    /**
     * `GET /api/v1/products` — paginated, filtered storefront product list. Query parameters mirror
     * WooCommerce Store API (category, tag, brand, attribute, attribute_term, on_sale, min_price,
     * max_price, stock_status, featured, search, orderby, order, page, per_page). Results are
     * always restricted to `status=publish` and `deleted_at IS NULL`.
     *
     * Results are cached under `catalog:products:list:<hash>:<locale>` with a 60s TTL and a 24h
     * grace window. Search queries skip the cache (long-tail keys would explode the keyspace).
     */
    async index(ctx: HttpContext) {
        const { request } = ctx;
        const locale = ctx.i18n.locale;
        const page = Math.max(1, Number(request.input("page", 1)) || 1);
        const limit = Math.min(100, Math.max(1, Number(request.input("limit", 20)) || 20));
        const orderby = String(request.input("orderby", "menu_order"));
        const order = String(request.input("order", "asc")).toLowerCase() === "desc" ? "desc" : "asc";

        const filters = {
            page,
            limit,
            orderby,
            order,
            category: request.input("category") ?? null,
            tag: request.input("tag") ?? null,
            brand: request.input("brand") ?? null,
            attribute: request.input("attribute") ?? null,
            attributeTerm: request.input("attribute_term") ?? null,
            onSale: request.input("on_sale") ?? null,
            minPrice: request.input("min_price") ?? null,
            maxPrice: request.input("max_price") ?? null,
            stockStatus: request.input("stock_status") ?? null,
            featured: request.input("featured") ?? null,
        };

        const search = request.input("search");
        const build = async () => {
            const query = Product.query()
                .apply((scopes) => scopes.published())
                .preload("translations")
                .preload("images", (q) => q.preload("media"));

            const categoryFilter = filters.category;
            if (categoryFilter) {
                const categoryIds = await resolveSlugsToIds(
                    "product_category_translations",
                    "category_id",
                    String(categoryFilter),
                    locale,
                );
                if (categoryIds.length === 0) {
                    return { data: [], meta: { page, limit, total: 0, lastPage: 0 } };
                }
                query.whereIn("id", (sub) =>
                    sub.select("product_id").from("product_category_links").whereIn("category_id", categoryIds),
                );
            }

            const tagFilter = filters.tag;
            if (tagFilter) {
                const tagIds = await resolveSlugsToIds("product_tag_translations", "tag_id", String(tagFilter), locale);
                if (tagIds.length === 0) {
                    return { data: [], meta: { page, limit, total: 0, lastPage: 0 } };
                }
                query.whereIn("id", (sub) => sub.select("product_id").from("product_tag_links").whereIn("tag_id", tagIds));
            }

            const brandFilter = filters.brand;
            if (brandFilter) {
                const brandIds = await resolveSlugsToIds("product_brand_translations", "brand_id", String(brandFilter), locale);
                if (brandIds.length === 0) {
                    return { data: [], meta: { page, limit, total: 0, lastPage: 0 } };
                }
                query.whereIn("id", (sub) => sub.select("product_id").from("product_brand_links").whereIn("brand_id", brandIds));
            }

            if (filters.attribute && filters.attributeTerm) {
                const linkIds = await db
                    .from("product_attribute_links")
                    .innerJoin("product_attributes", "product_attribute_links.attribute_id", "product_attributes.id")
                    .innerJoin(
                        "product_attribute_link_terms",
                        "product_attribute_link_terms.link_id",
                        "product_attribute_links.id",
                    )
                    .innerJoin(
                        "product_attribute_term_translations",
                        "product_attribute_term_translations.term_id",
                        "product_attribute_link_terms.term_id",
                    )
                    .where("product_attributes.code", String(filters.attribute))
                    .where("product_attribute_term_translations.slug", String(filters.attributeTerm))
                    .select("product_attribute_links.product_id as product_id");
                const productIds = linkIds.map((row) => row.product_id);
                if (productIds.length === 0) {
                    return { data: [], meta: { page, limit, total: 0, lastPage: 0 } };
                }
                query.whereIn("id", productIds);
            }

            if (filters.onSale) {
                query.whereNotNull("sale_price");
            }
            if (filters.minPrice !== null && filters.minPrice !== undefined) {
                query.where("regular_price", ">=", Number(filters.minPrice));
            }
            if (filters.maxPrice !== null && filters.maxPrice !== undefined) {
                query.where("regular_price", "<=", Number(filters.maxPrice));
            }
            if (filters.stockStatus) {
                query.whereIn("id", (sub) =>
                    sub.select("product_id").from("inventory_items").where("stock_status", String(filters.stockStatus)),
                );
            }
            if (filters.featured) {
                query.where("featured", true);
            }
            if (search) {
                const needle = `%${String(search)}%`;
                query.whereIn("id", (sub) => sub.select("product_id").from("product_translations").whereILike("name", needle));
            }

            const sortColumn = SORT_COLUMNS[orderby] ?? "menu_order";
            query.orderBy(sortColumn, order as "asc" | "desc");
            query.orderBy("id", "asc");

            const paginator = await query.paginate(page, limit);
            return paginated(ProductTransformer.transform(paginator.all(), locale), paginator);
        };

        if (search) {
            return build();
        }

        return cache.getOrSet({
            key: CacheKeys.catalog.productList(currentTenantId(), filters, locale),
            ttl: "60s",
            tags: [CacheTags.catalogProducts(currentTenantId())],
            factory: build,
        });
    }

    /**
     * `GET /api/v1/products/:slug` — single product resolved by **localized slug**. Joins
     * `product_translations` on the active locale, returns 404 if no row matches that locale or
     * `deleted_at` is set. Includes variations + images + attribute links eager-loaded.
     *
     * Slug → id resolution happens outside the cache so the cached payload is keyed by `product_id`
     * (via the `catalog:product:<id>` tag, which lets `CatalogWriter` invalidate one product
     * without touching the rest of the catalog).
     */
    async show(ctx: HttpContext) {
        const slug = ctx.params.slug;
        const locale = ctx.i18n.locale;

        const translation = await db
            .from("product_translations")
            .where("locale", locale)
            .where("slug", slug)
            .select("product_id")
            .first();

        if (!translation) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }

        const productId = Number(translation.product_id);
        const cached = await cache.getOrSet({
            key: CacheKeys.catalog.productDetail(currentTenantId(), productId, locale),
            ttl: "5m",
            tags: [CacheTags.catalogProducts(currentTenantId()), CacheTags.catalogProduct(currentTenantId(), productId)],
            factory: async () => {
                const product = await Product.query()
                    .where("id", productId)
                    .apply((scopes) => scopes.notTrashed())
                    .preload("translations")
                    .preload("images", (q) => q.preload("media"))
                    .preload("variations", (q) => q.preload("translations").preload("attributePins"))
                    .preload("attributeLinks", (q) => q.preload("terms"))
                    .preload("categories", (q) => q.preload("translations"))
                    .preload("tags", (q) => q.preload("translations"))
                    .preload("brands", (q) => q.preload("translations"))
                    .first();

                if (!product || product.status !== "publish") {
                    return null;
                }

                return resource(ProductTransformer.transform(product, locale).useVariant("forDetail"));
            },
        });

        if (cached === null) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }

        return cached;
    }

    /** `GET /api/v1/products/:id/variations` — list of variations for a product. */
    async variations(ctx: HttpContext) {
        const productId = Number(ctx.params.id);
        const locale = ctx.i18n.locale;

        const cached = await cache.getOrSet({
            key: CacheKeys.catalog.productVariations(currentTenantId(), productId, locale),
            ttl: "5m",
            tags: [CacheTags.catalogProduct(currentTenantId(), productId)],
            factory: async () => {
                const product = await Product.query()
                    .where("id", productId)
                    .apply((scopes) => scopes.notTrashed())
                    .first();
                if (!product) return null;
                const variations = await product
                    .related("variations")
                    .query()
                    .preload("translations")
                    .preload("attributePins")
                    .orderBy("menu_order", "asc")
                    .orderBy("id", "asc");
                return collection(ProductVariationTransformer.transform(variations, locale));
            },
        });

        if (cached === null) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        return cached;
    }
}

async function resolveSlugsToIds(table: string, idColumn: string, slugOrId: string, locale: string): Promise<number[]> {
    const value = String(slugOrId);
    if (/^\d+$/.test(value)) {
        return [Number(value)];
    }
    const rows = await db.from(table).where("locale", locale).where("slug", value).select(idColumn);
    return rows.map((row) => Number(row[idColumn]));
}
