import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import ProductCategory from "#models/product_category";
import { CacheInvalidation } from "#services/cache_invalidation";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { collection, resource } from "#transformers/api_envelope";
import ProductCategoryTransformer from "#transformers/product_category_transformer";
import { createCategoryValidator, updateCategoryValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

type TaxonomySort = "-used_count" | "used_count" | "menu_order" | "-menu_order" | undefined;

function parseSort(input: unknown): TaxonomySort {
    const value = typeof input === "string" ? input : "";
    if (value === "-used_count" || value === "used_count" || value === "menu_order" || value === "-menu_order") {
        return value;
    }
    return undefined;
}

export default class AdminCategoriesController {
    async index(ctx: HttpContext) {
        const sort = parseSort(ctx.request.input("sort"));
        const locale = ctx.i18n.locale;

        if (sort === "-used_count" || sort === "used_count") {
            const direction = sort === "-used_count" ? "desc" : "asc";
            const perPageRaw = Number(ctx.request.input("perPage", 0)) || 0;
            const perPage = perPageRaw > 0 && perPageRaw <= 500 ? perPageRaw : 0;
            return cache.getOrSet({
                key: CacheKeys.admin.taxonomyUsedCount("categories", { sort, perPage }, locale),
                ttl: "2m",
                tags: [CacheTags.catalogTaxonomy],
                factory: async () => {
                    let query = ProductCategory.query()
                        .preload("translations")
                        .preload("image")
                        .withCount("products", (q) => q.as("used_count"))
                        .orderBy("used_count", direction)
                        .orderBy("id");
                    if (perPage > 0) query = query.limit(perPage);
                    const rows = await query;
                    return collection(ProductCategoryTransformer.transform(rows, locale).useVariant("forAdmin"));
                },
            });
        }

        const rows = await ProductCategory.query().preload("translations").preload("image").orderBy("menu_order").orderBy("id");
        return collection(ProductCategoryTransformer.transform(rows, locale).useVariant("forAdmin"));
    }

    async show(ctx: HttpContext) {
        const row = await ProductCategory.query().where("id", ctx.params.id).preload("translations").preload("image").first();
        if (!row) return ctx.response.status(404).json({ error: "category_not_found" });
        return resource(ProductCategoryTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createCategoryValidator);
        const row = await withTransaction(async (trx) => {
            const created = new ProductCategory();
            created.useTransaction(trx);
            created.parentId = (payload.parent_id ?? null) as bigint | number | null;
            if (payload.display !== undefined) created.display = payload.display;
            created.imageMediaId = (payload.image_media_id ?? null) as bigint | number | null;
            if (payload.menu_order !== undefined) created.menuOrder = payload.menu_order;
            await created.save();
            await upsertTranslations(
                trx,
                "product_category_translations",
                "category_id",
                created.id,
                payload.translations as never,
                TAXONOMY_FIELDS as never,
            );
            return created;
        });
        await row.load("translations");
        await row.load("image");
        await CacheInvalidation.taxonomyChanged();
        ctx.response.status(201);
        return resource(ProductCategoryTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductCategory.query().where("id", ctx.params.id).first();
        if (!row) return ctx.response.status(404).json({ error: "category_not_found" });
        const payload = await ctx.request.validateUsing(updateCategoryValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            if (payload.parent_id !== undefined) row.parentId = payload.parent_id as bigint | number | null;
            if (payload.display !== undefined) row.display = payload.display;
            if (payload.image_media_id !== undefined) row.imageMediaId = payload.image_media_id as bigint | number | null;
            if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order;
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_category_translations",
                    "category_id",
                    row.id,
                    payload.translations as never,
                    TAXONOMY_FIELDS as never,
                );
            }
        });
        await row.load("translations");
        await row.load("image");
        await CacheInvalidation.taxonomyChanged();
        return resource(ProductCategoryTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductCategory.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "category_not_found" });
        await row.delete();
        await CacheInvalidation.taxonomyChanged();
        return ctx.response.status(204);
    }
}
