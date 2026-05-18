import type { HttpContext } from "@adonisjs/core/http";

import ProductTag from "#models/product_tag";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { collection, resource } from "#transformers/api_envelope";
import ProductTagTransformer from "#transformers/product_tag_transformer";
import { createTagValidator, updateTagValidator } from "#validators/catalog/taxonomy_validator";

const TAXONOMY_FIELDS = ["name", "slug", "description"] as const;

export default class AdminTagsController {
    async index(ctx: HttpContext) {
        const rows = await ProductTag.query().preload("translations").orderBy("menu_order").orderBy("id");
        return collection(ProductTagTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"));
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
        return resource(ProductTagTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductTag.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "tag_not_found" });
        await row.delete();
        return ctx.response.status(204);
    }
}
