import type { HttpContext } from "@adonisjs/core/http";

import ProductBrand from "#models/product_brand";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { collection, resource } from "#transformers/api_envelope";
import ProductBrandTransformer from "#transformers/product_brand_transformer";
import { createBrandValidator, updateBrandValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

export default class AdminBrandsController {
    async index(ctx: HttpContext) {
        const rows = await ProductBrand.query().preload("translations").preload("image").orderBy("menu_order").orderBy("id");
        return collection(ProductBrandTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"));
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
            if (payload.image_media_id !== undefined) created.imageMediaId = payload.image_media_id as bigint | number | null;
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
        return resource(ProductBrandTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductBrand.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "brand_not_found" });
        await row.delete();
        return ctx.response.status(204);
    }
}
