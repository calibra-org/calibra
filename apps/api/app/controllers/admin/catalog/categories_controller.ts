import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import ProductCategory from "#models/product_category";
import { CacheInvalidation } from "#services/cache_invalidation";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { adminCategoriesView } from "#table_views/admin/categories";
import { collection, resource } from "#transformers/api_envelope";
import ProductCategoryTransformer from "#transformers/product_category_transformer";
import { createCategoryValidator, updateCategoryValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

const adminCategoriesListValidator = adminCategoriesView.compileStrict({
    extras: { q: vine.string().trim().maxLength(120).optional() },
    defaultLimit: 100,
});

export default class AdminCategoriesController {
    async index(ctx: HttpContext) {
        const parsed = await adminCategoriesListValidator.validate(ctx.request.qs());
        const builder = ProductCategory.query()
            .preload("translations")
            .preload("image")
            .withCount("products", (q) => q.as("used_count"));

        if (parsed.q !== undefined && parsed.q.length > 0) {
            const needle = `%${parsed.q.toLowerCase()}%`;
            builder.where((sub) => {
                sub.whereILike("product_categories.slug", needle).orWhereIn("product_categories.id", (nested) => {
                    nested
                        .select("category_id")
                        .from("product_category_translations")
                        .whereRaw("LOWER(name) LIKE ?", [needle]);
                });
            });
        }

        const { data: rows, meta } = await adminCategoriesView.run<ProductCategory>(builder, parsed);
        const { data } = await collection<unknown>(
            ProductCategoryTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"),
        );
        return { data, meta };
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
