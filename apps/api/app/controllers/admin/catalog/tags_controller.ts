import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import ProductTag from "#models/product_tag";
import { CacheInvalidation } from "#services/cache_invalidation";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { adminTagsView } from "#table_views/admin/tags";
import { collection, resource } from "#transformers/api_envelope";
import ProductTagTransformer from "#transformers/product_tag_transformer";
import { createTagValidator, updateTagValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

/**
 * `maxLimit` is raised to 500 (above the TableView default cap of 100) so the tags picker
 * (`useTagsList` defaults to `limit=500`) and the tags list page (`limit=200`) can fetch the
 * whole set in one shot. Uniform across the taxonomy family.
 */
const adminTagsListValidator = adminTagsView.compileStrict({
    extras: { q: vine.string().trim().maxLength(120).optional() },
    defaultLimit: 100,
    maxLimit: 500,
});

export default class AdminTagsController {
    async index(ctx: HttpContext) {
        const parsed = await adminTagsListValidator.validate(ctx.request.qs());
        const builder = ProductTag.query()
            .preload("translations")
            .withCount("products", (q) => q.as("used_count"));

        if (parsed.q !== undefined && parsed.q.length > 0) {
            const needle = `%${parsed.q.toLowerCase()}%`;
            /** `slug` lives on the translations table, not `product_tags`, so both the name and
             * slug needles match against `product_tag_translations`. */
            builder.whereIn("product_tags.id", (nested) => {
                nested
                    .select("tag_id")
                    .from("product_tag_translations")
                    .whereRaw("LOWER(name) LIKE ?", [needle])
                    .orWhereRaw("LOWER(slug) LIKE ?", [needle]);
            });
        }

        const { data: rows, meta } = await adminTagsView.run<ProductTag>(builder, parsed);
        const { data } = await collection<unknown>(ProductTagTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"));
        return { data, meta };
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
