import type { HttpContext } from "@adonisjs/core/http";

import TaxClass from "#models/tax_class";
import { adminTaxClassesView } from "#table_views/admin/tax_classes";
import { collection, resource } from "#transformers/api_envelope";
import TaxClassTransformer from "#transformers/tax_class_transformer";
import { createTaxClassValidator, updateTaxClassValidator } from "#validators/catalog/taxonomy_validator";

const adminTaxClassesListValidator = adminTaxClassesView.compileStrict({ defaultLimit: 100 });

export default class AdminTaxClassesController {
    async index(ctx: HttpContext) {
        const parsed = await adminTaxClassesListValidator.validate(ctx.request.qs());
        const { data: rows, meta } = await adminTaxClassesView.run<TaxClass>(TaxClass.query(), parsed);
        const { data } = await collection<unknown>(TaxClassTransformer.transform(rows).useVariant("forAdmin"));
        return { data, meta };
    }

    async show(ctx: HttpContext) {
        const row = await TaxClass.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "tax_class_not_found" });
        return resource(TaxClassTransformer.transform(row).useVariant("forAdmin"));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createTaxClassValidator);
        const existing = await TaxClass.findBy("slug", payload.slug);
        if (existing) return ctx.response.status(409).json({ error: "tax_class_slug_taken" });
        const created = await TaxClass.create({ slug: payload.slug, name: payload.name });
        ctx.response.status(201);
        return resource(TaxClassTransformer.transform(created).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await TaxClass.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "tax_class_not_found" });
        const payload = await ctx.request.validateUsing(updateTaxClassValidator);
        if (payload.slug !== undefined && payload.slug !== row.slug) {
            const conflict = await TaxClass.query().where("slug", payload.slug).whereNot("id", Number(row.id)).first();
            if (conflict) return ctx.response.status(409).json({ error: "tax_class_slug_taken" });
            row.slug = payload.slug;
        }
        if (payload.name !== undefined) row.name = payload.name;
        await row.save();
        return resource(TaxClassTransformer.transform(row).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await TaxClass.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "tax_class_not_found" });
        await row.delete();
        return ctx.response.status(204);
    }
}
