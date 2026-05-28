import type { HttpContext } from "@adonisjs/core/http";

import ProductShippingClass from "#models/product_shipping_class";
import { upsertTranslations, withTransaction } from "#services/catalog_writer";
import { adminShippingClassesView } from "#table_views/admin/shipping_classes";
import { collection, resource } from "#transformers/api_envelope";
import ProductShippingClassTransformer from "#transformers/product_shipping_class_transformer";
import { createShippingClassValidator, updateShippingClassValidator } from "#validators/catalog/taxonomy_validator";

const SHIPPING_FIELDS = ["name", "description"] as const;

/**
 * `maxLimit` is raised to 500 (above the TableView default cap of 100) so shipping-class
 * selectors fetch the whole set in one shot. Uniform across the catalog family.
 */
const adminShippingClassesListValidator = adminShippingClassesView.compileStrict({ defaultLimit: 100, maxLimit: 500 });

export default class AdminShippingClassesController {
    async index(ctx: HttpContext) {
        const parsed = await adminShippingClassesListValidator.validate(ctx.request.qs());
        const builder = ProductShippingClass.query().preload("translations");
        const { data: rows, meta } = await adminShippingClassesView.run<ProductShippingClass>(builder, parsed);
        const { data } = await collection<unknown>(
            ProductShippingClassTransformer.transform(rows, ctx.i18n.locale).useVariant("forAdmin"),
        );
        return { data, meta };
    }

    async show(ctx: HttpContext) {
        const row = await ProductShippingClass.query().where("id", ctx.params.id).preload("translations").first();
        if (!row) return ctx.response.status(404).json({ error: "shipping_class_not_found" });
        return resource(ProductShippingClassTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createShippingClassValidator);
        const row = await withTransaction(async (trx) => {
            const created = new ProductShippingClass();
            created.useTransaction(trx);
            created.slug = payload.slug;
            if (payload.menu_order !== undefined) created.menuOrder = payload.menu_order;
            await created.save();
            await upsertTranslations(
                trx,
                "product_shipping_class_translations",
                "shipping_class_id",
                created.id,
                payload.translations as never,
                SHIPPING_FIELDS as never,
            );
            return created;
        });
        await row.load("translations");
        ctx.response.status(201);
        return resource(ProductShippingClassTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductShippingClass.query().where("id", ctx.params.id).first();
        if (!row) return ctx.response.status(404).json({ error: "shipping_class_not_found" });
        const payload = await ctx.request.validateUsing(updateShippingClassValidator);
        await withTransaction(async (trx) => {
            row.useTransaction(trx);
            if (payload.slug !== undefined) row.slug = payload.slug;
            if (payload.menu_order !== undefined) row.menuOrder = payload.menu_order;
            await row.save();
            if (payload.translations) {
                await upsertTranslations(
                    trx,
                    "product_shipping_class_translations",
                    "shipping_class_id",
                    row.id,
                    payload.translations as never,
                    SHIPPING_FIELDS as never,
                );
            }
        });
        await row.load("translations");
        return resource(ProductShippingClassTransformer.transform(row, ctx.i18n.locale).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductShippingClass.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "shipping_class_not_found" });
        await row.delete();
        return ctx.response.status(204);
    }
}
