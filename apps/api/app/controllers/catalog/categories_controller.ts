import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import ProductCategory from "#models/product_category";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { collection, resource } from "#transformers/api_envelope";
import ProductCategoryTransformer from "#transformers/product_category_transformer";

export default class CategoriesController {
    /**
     * `GET /api/v1/categories` — flat list by default, or `?tree=1` to nest children under their
     * parents. `?parent_id=null` filters to root-level rows only.
     *
     * Cached 15m with the `catalog:categories`/`catalog:taxonomy` tags — these change rarely and
     * are read on every storefront render, so a long TTL with broad-tag invalidation is the
     * sweet spot. The recursive tree-build is the expensive part.
     */
    async index(ctx: HttpContext) {
        const { request } = ctx;
        const locale = ctx.i18n.locale;
        const parentIdParam = request.input("parent_id");
        const tree = String(request.input("tree", "") ?? "") === "1";

        if (tree) {
            return cache.getOrSet({
                key: CacheKeys.catalog.categoriesTree(locale),
                ttl: "15m",
                tags: [CacheTags.catalogCategories, CacheTags.catalogTaxonomy],
                factory: async () => {
                    const rows = await ProductCategory.query()
                        .preload("translations")
                        .orderBy("menu_order", "asc")
                        .orderBy("id", "asc");
                    const byParent = new Map<string | "root", ProductCategory[]>();
                    for (const row of rows) {
                        const key = row.parentId === null ? "root" : String(row.parentId);
                        if (!byParent.has(key)) byParent.set(key, []);
                        byParent.get(key)!.push(row);
                    }
                    const wrapped = await collection(ProductCategoryTransformer.transform(byParent.get("root") ?? [], locale));
                    const baseList = wrapped.data as Array<Record<string, unknown>>;
                    const attachChildren = async (
                        serialized: Array<Record<string, unknown>>,
                        parentRows: ProductCategory[],
                    ): Promise<void> => {
                        for (let i = 0; i < parentRows.length; i += 1) {
                            const parent = parentRows[i]!;
                            const childRows = byParent.get(String(parent.id)) ?? [];
                            const wrappedChildren = await collection(ProductCategoryTransformer.transform(childRows, locale));
                            const childData = wrappedChildren.data as Array<Record<string, unknown>>;
                            await attachChildren(childData, childRows);
                            serialized[i]!.children = childData;
                        }
                    };
                    await attachChildren(baseList, byParent.get("root") ?? []);
                    return { data: baseList };
                },
            });
        }

        const parentScope = parentIdParam === undefined ? "any" : parentIdParam === "null" ? null : String(parentIdParam);

        return cache.getOrSet({
            key: CacheKeys.catalog.categoriesFlat(parentScope, locale),
            ttl: "15m",
            tags: [CacheTags.catalogCategories, CacheTags.catalogTaxonomy],
            factory: async () => {
                const query = ProductCategory.query().preload("translations").orderBy("menu_order", "asc").orderBy("id", "asc");
                if (parentScope === null) query.whereNull("parent_id");
                else if (parentScope !== "any") query.where("parent_id", parentScope);
                const rows = await query;
                return collection(ProductCategoryTransformer.transform(rows, locale));
            },
        });
    }

    /** `GET /api/v1/categories/:slug` — single category resolved by localized slug. */
    async show(ctx: HttpContext) {
        const slug = ctx.params.slug;
        const locale = ctx.i18n.locale;

        const translation = await db
            .from("product_category_translations")
            .where("locale", locale)
            .where("slug", slug)
            .select("category_id")
            .first();
        if (!translation) {
            return ctx.response.status(404).json({ error: "category_not_found" });
        }

        const cached = await cache.getOrSet({
            key: CacheKeys.catalog.categoryDetail(slug, locale),
            ttl: "15m",
            tags: [CacheTags.catalogCategories, CacheTags.catalogTaxonomy],
            factory: async () => {
                const category = await ProductCategory.query()
                    .where("id", translation.category_id)
                    .preload("translations")
                    .first();
                if (!category) return null;
                return resource(ProductCategoryTransformer.transform(category, locale));
            },
        });

        if (cached === null) {
            return ctx.response.status(404).json({ error: "category_not_found" });
        }
        return cached;
    }
}
