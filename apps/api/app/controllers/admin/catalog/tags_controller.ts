import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import ProductTag from "#models/product_tag";
import { CacheInvalidation } from "#services/cache_invalidation";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { collection, resource } from "#transformers/api_envelope";
import ProductTagTransformer from "#transformers/product_tag_transformer";
import { createTagValidator, updateTagValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

type TaxonomySort = "-used_count" | "used_count" | "menu_order" | "-menu_order" | undefined;

function parseSort(input: unknown): TaxonomySort {
    const value = typeof input === "string" ? input : "";
    if (value === "-used_count" || value === "used_count" || value === "menu_order" || value === "-menu_order") {
        return value;
    }
    return undefined;
}

export default class AdminTagsController {
    async index(ctx: HttpContext) {
        const sort = parseSort(ctx.request.input("sort"));
        const locale = ctx.i18n.locale;

        if (sort === "-used_count" || sort === "used_count") {
            const direction = sort === "-used_count" ? "desc" : "asc";
            const perPageRaw = Number(ctx.request.input("perPage", 0)) || 0;
            const perPage = perPageRaw > 0 && perPageRaw <= 500 ? perPageRaw : 0;
            return cache.getOrSet({
                key: CacheKeys.admin.taxonomyUsedCount("tags", { sort, perPage }, locale),
                ttl: "2m",
                tags: [CacheTags.catalogTaxonomy],
                factory: async () => {
                    let query = ProductTag.query()
                        .preload("translations")
                        .withCount("products", (q) => q.as("used_count"))
                        .orderBy("used_count", direction)
                        .orderBy("id");
                    if (perPage > 0) query = query.limit(perPage);
                    const rows = await query;
                    return collection(ProductTagTransformer.transform(rows, locale).useVariant("forAdmin"));
                },
            });
        }

        const rows = await ProductTag.query()
            .preload("translations")
            .withCount("products", (q) => q.as("used_count"))
            .orderBy("menu_order")
            .orderBy("id");
        return collection(ProductTagTransformer.transform(rows, locale).useVariant("forAdmin"));
    }

    async show(ctx: HttpContext) {
        const row = await ProductTag.query().where("id", ctx.params.id).preload("translations").first();
        if (!row) return ctx.response.status(404).json({ error: "tag_not_found" });
        return resource(ProductTagTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createTagValidator);
        const row = await withTransaction(async (trx) => {
            const created = new ProductTag();
            created.useTransaction(trx);
            if (payload.menu_order !== undefined) created.menuOrder = payload.menu_order;
            await created.save();
            await upsertTranslations(
                trx,
                "product_tag_translations",
                "tag_id",
                created.id,
                payload.translations as never,
                TAXONOMY_FIELDS as never,
            );
            return created;
        });
        await row.load("translations");
        await CacheInvalidation.taxonomyChanged();
        ctx.response.status(201);
        return resource(ProductTagTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductTag.query().where("id", ctx.params.id).first();
        if (!row) return ctx.response.status(404).json({ error: "tag_not_found" });
        const payload = await ctx.request.validateUsing(updateTagValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order;
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_tag_translations",
                    "tag_id",
                    row.id,
                    payload.translations as never,
                    TAXONOMY_FIELDS as never,
                );
            }
        });
        await row.load("translations");
        await CacheInvalidation.taxonomyChanged();
        return resource(ProductTagTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductTag.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "tag_not_found" });
        await row.delete();
        await CacheInvalidation.taxonomyChanged();
        return ctx.response.status(204);
    }
}
