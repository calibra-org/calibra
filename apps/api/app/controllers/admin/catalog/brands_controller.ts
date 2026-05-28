import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import ProductBrand from "#models/product_brand";
import { CacheInvalidation } from "#services/cache_invalidation";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { adminBrandsView } from "#table_views/admin/brands";
import { collection, resource } from "#transformers/api_envelope";
import ProductBrandTransformer from "#transformers/product_brand_transformer";
import { createBrandValidator, updateBrandValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

/**
 * Default page size large enough that selector / combobox UIs render the full set without
 * forcing a `?limit=` override on the wire. `maxLimit` is raised to 500 (above the TableView
 * default cap of 100) because the brand sidebar picker and the brands page fetch the whole set
 * in one shot (`useBrandsList` defaults to `limit=500`, the list page requests `limit=200`);
 * the cap is uniform across the taxonomy family so selectors behave identically. `q` is a
 * controller-side multi-column ILIKE across the brand slug and the translated name (the runtime
 * can't model "match across translations in any locale" as a per-field predicate).
 */
const adminBrandsListValidator = adminBrandsView.compileStrict({
    extras: { q: vine.string().trim().maxLength(120).optional() },
    defaultLimit: 100,
    maxLimit: 500,
});

export default class AdminBrandsController {
    async index(ctx: HttpContext) {
        const parsed = await adminBrandsListValidator.validate(ctx.request.qs());
        /** `withCount('products')` surfaces the live link count to the transformer as
         * `$extras.used_count`. The view's `used_count` orderable column drives ORDER BY via
         * `sortRaw`; this `withCount` populates the response field — different surface, same
         * predicate (count of `product_brand_links` rows). */
        const builder = ProductBrand.query()
            .preload("translations")
            .preload("image")
            .withCount("products", (q) => q.as("used_count"));

        if (parsed.q !== undefined && parsed.q.length > 0) {
            const needle = `%${parsed.q.toLowerCase()}%`;
            /** `slug` lives on the translations table, not `product_brands`, so both the name and
             * slug needles match against `product_brand_translations`. */
            builder.whereIn("product_brands.id", (nested) => {
                nested
                    .select("brand_id")
                    .from("product_brand_translations")
                    .whereRaw("LOWER(name) LIKE ?", [needle])
                    .orWhereRaw("LOWER(slug) LIKE ?", [needle]);
            });
        }

        const { data: rows, meta } = await adminBrandsView.run<ProductBrand>(builder, parsed);
        const { data } = await collection<unknown>(
            ProductBrandTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"),
        );
        return { data, meta };
    }

    async show(ctx: HttpContext) {
        const row = await ProductBrand.query().where("id", ctx.params.id).preload("translations").preload("image").first();
        if (!row) return ctx.response.status(404).json({ error: "brand_not_found" });
        return resource(ProductBrandTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createBrandValidator);
        const row = await withTransaction(async (trx) => {
            const created = new ProductBrand();
            created.useTransaction(trx);
            created.imageMediaId = (payload.image_media_id ?? null) as bigint | number | null;
            if (payload.menu_order !== undefined) created.menuOrder = payload.menu_order;
            await created.save();
            await upsertTranslations(
                trx,
                "product_brand_translations",
                "brand_id",
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
        return resource(ProductBrandTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductBrand.query().where("id", ctx.params.id).first();
        if (!row) return ctx.response.status(404).json({ error: "brand_not_found" });
        const payload = await ctx.request.validateUsing(updateBrandValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            if (payload.image_media_id !== undefined) row.imageMediaId = payload.image_media_id as bigint | number | null;
            if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order;
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_brand_translations",
                    "brand_id",
                    row.id,
                    payload.translations as never,
                    TAXONOMY_FIELDS as never,
                );
            }
        });
        await row.load("translations");
        await row.load("image");
        await CacheInvalidation.taxonomyChanged();
        return resource(ProductBrandTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductBrand.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "brand_not_found" });
        await row.delete();
        await CacheInvalidation.taxonomyChanged();
        return ctx.response.status(204);
    }
}
