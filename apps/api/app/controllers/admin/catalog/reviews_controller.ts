import type { HttpContext } from "@adonisjs/core/http";

import ProductReview from "#models/product_review";
import { collection, resource } from "#transformers/api_envelope";
import ProductReviewTransformer from "#transformers/product_review_transformer";
import { moderateReviewValidator } from "#validators/catalog/review_validator";

export default class AdminReviewsController {
    async index(ctx: HttpContext) {
        const query = ProductReview.query();
        if (ctx.request.input("status")) query.where("status", String(ctx.request.input("status")));
        if (ctx.request.input("product_id")) query.where("product_id", String(ctx.request.input("product_id")));
        query.orderBy("created_at", "desc");
        const rows = await query;
        return collection(ProductReviewTransformer.transform(rows).useVariant("forAdmin"));
    }

    async update(ctx: HttpContext) {
        const row = await ProductReview.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "review_not_found" });
        const payload = await ctx.request.validateUsing(moderateReviewValidator);
        row.status = payload.status;
        await row.save();
        return resource(ProductReviewTransformer.transform(row).useVariant("forAdmin"));
    }

    async destroy(ctx: HttpContext) {
        const row = await ProductReview.find(ctx.params.id);
        if (!row) return ctx.response.status(404).json({ error: "review_not_found" });
        await row.delete();
        return ctx.response.status(204);
    }
}
