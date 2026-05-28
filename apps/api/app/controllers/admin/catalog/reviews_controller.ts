import type { HttpContext } from "@adonisjs/core/http";

import ProductReview from "#models/product_review";
import { adminReviewsView } from "#table_views/admin/reviews";
import { collection, resource } from "#transformers/api_envelope";
import ProductReviewTransformer from "#transformers/product_review_transformer";
import { moderateReviewValidator } from "#validators/catalog/review_validator";

/** Strict mode: any non-TableView query key returns 422. */
const adminReviewsListValidator = adminReviewsView.compileStrict();

export default class AdminReviewsController {
    async index(ctx: HttpContext) {
        const parsed = await adminReviewsListValidator.validate(ctx.request.qs());
        const { data: rows, meta } = await adminReviewsView.run<ProductReview>(ProductReview.query(), parsed);
        const { data } = await collection<unknown>(ProductReviewTransformer.transform(rows).useVariant("forAdmin"));
        return { data, meta };
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
