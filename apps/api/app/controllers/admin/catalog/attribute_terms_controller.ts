import type { HttpContext } from "@adonisjs/core/http";

import ProductAttribute from "#models/product_attribute";
import ProductAttributeTerm from "#models/product_attribute_term";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { collection, resource } from "#transformers/api_envelope";
import ProductAttributeTermTransformer from "#transformers/product_attribute_term_transformer";
import { createAttributeTermValidator, updateAttributeTermValidator } from "#validators/catalog/attribute_validator";

const TERM_FIELDS = ["name", "slug", "description"] as const;

export default class AdminAttributeTermsController {
    async index(ctx: HttpContext) {
        const attribute = await ProductAttribute.find(ctx.params.attribute_id);
        if (!attribute) return ctx.response.status(404).json({ error: "attribute_not_found" });
        const rows = await ProductAttributeTerm.query()
            .where("attribute_id", String(attribute.id))
            .preload("translations")
            .orderBy("menu_order")
            .orderBy("id");
        return collection(ProductAttributeTermTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const attribute = await ProductAttribute.find(ctx.params.attribute_id);
        if (!attribute) return ctx.response.status(404).json({ error: "attribute_not_found" });
        const payload = await ctx.request.validateUsing(createAttributeTermValidator);
        const row = await withTransaction(async (trx) => {
            const created = new ProductAttributeTerm();
            created.useTransaction(trx);
            created.attributeId = attribute.id;
            if (payload.menu_order !== undefined) created.menuOrder = payload.menu_order;
            await created.save();
            await upsertTranslations(
                trx,
                "product_attribute_term_translations",
                "term_id",
                created.id,
                payload.translations as never,
                TERM_FIELDS as never,
            );
            return created;
        });
        await row.load("translations");
        ctx.response.status(201);
        return resource(ProductAttributeTermTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductAttributeTerm.query()
            .where("attribute_id", String(ctx.params.attribute_id))
            .where("id", ctx.params.id)
            .first();
        if (!row) return ctx.response.status(404).json({ error: "term_not_found" });
        const payload = await ctx.request.validateUsing(updateAttributeTermValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order;
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_attribute_term_translations",
                    "term_id",
                    row.id,
                    payload.translations as never,
                    TERM_FIELDS as never,
                );
            }
        });
        await row.load("translations");
        return resource(ProductAttributeTermTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductAttributeTerm.query()
            .where("attribute_id", String(ctx.params.attribute_id))
            .where("id", ctx.params.id)
            .first();
        if (!row) return ctx.response.status(404).json({ error: "term_not_found" });
        await row.delete();
        return ctx.response.status(204);
    }
}
