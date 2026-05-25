import type { HttpContext } from "@adonisjs/core/http";

import ProductAttribute from "#models/product_attribute";
import { CacheInvalidation } from "#services/cache_invalidation";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { collection, resource } from "#transformers/api_envelope";
import ProductAttributeTransformer from "#transformers/product_attribute_transformer";
import { createAttributeValidator, updateAttributeValidator } from "#validators/catalog/attribute_validator";

const ATTRIBUTE_FIELDS = ["name"] as const;

export default class AdminAttributesController {
    async index(ctx: HttpContext) {
        const rows = await ProductAttribute.query().preload("translations").orderBy("id");
        return collection(ProductAttributeTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async show(ctx: HttpContext) {
        const row = await ProductAttribute.query().where("id", ctx.params.id).preload("translations").first();
        if (!row) return ctx.response.status(404).json({ error: "attribute_not_found" });
        return resource(ProductAttributeTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createAttributeValidator);
        const row = await withTransaction(async (trx) => {
            const created = new ProductAttribute();
            created.useTransaction(trx);
            created.code = payload.code;
            if (payload.order_by !== undefined) created.orderBy = payload.order_by;
            if (payload.has_archives !== undefined) created.hasArchives = payload.has_archives;
            await created.save();
            await upsertTranslations(
                trx,
                "product_attribute_translations",
                "attribute_id",
                created.id,
                payload.translations as never,
                ATTRIBUTE_FIELDS as never,
            );
            return created;
        });
        await row.refresh();
        await row.load("translations");
        await CacheInvalidation.taxonomyChanged();
        ctx.response.status(201);
        return resource(ProductAttributeTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductAttribute.query().where("id", ctx.params.id).first();
        if (!row) return ctx.response.status(404).json({ error: "attribute_not_found" });
        const payload = await ctx.request.validateUsing(updateAttributeValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            if (payload.order_by !== undefined) row.orderBy = payload.order_by;
            if (payload.has_archives !== undefined) row.hasArchives = payload.has_archives;
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_attribute_translations",
                    "attribute_id",
                    row.id,
                    payload.translations as never,
                    ATTRIBUTE_FIELDS as never,
                );
            }
        });
        await row.load("translations");
        await CacheInvalidation.taxonomyChanged();
        return resource(ProductAttributeTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductAttribute.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "attribute_not_found" });
        await row.delete();
        await CacheInvalidation.taxonomyChanged();
        return ctx.response.status(204);
    }
}
