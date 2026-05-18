import type { HttpContext } from "@adonisjs/core/http";

import Product from "#models/product";
import ProductReview from "#models/product_review";
import { collection, resource } from "#transformers/api_envelope";
import ProductReviewTransformer from "#transformers/product_review_transformer";
import { createReviewValidator } from "#validators/catalog/review_validator";

export default class ReviewsController {
    /** `GET /api/v1/products/:id/reviews` — public list, returns only approved reviews. */
    async index(ctx: HttpContext) {
        const productId = ctx.params.id;
        const product = await Product.find(productId);
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        const reviews = await ProductReview.query()
            .where("product_id", String(product.id))
            .where("status", "approved")
            .orderBy("created_at", "desc");
        return collection(ProductReviewTransformer.transform(reviews));
    }

    /**
     * `POST /api/v1/products/:id/reviews` — submit a review. Lands as `pending` regardless of who
     * submitted it; moderator approves later. `customer_id` is set if the request is authenticated
     * (placeholder for phase 03 — currently always null).
     */
    async store(ctx: HttpContext) {
        const productId = ctx.params.id;
        const product = await Product.find(productId);
        if (!product) {
            return ctx.response.status(404).json({ error: "product_not_found" });
        }
        if (!product.reviewsAllowed) {
            return ctx.response.status(403).json({ error: "reviews_disabled" });
        }
        const payload = await ctx.request.validateUsing(createReviewValidator);
        const review = await ProductReview.create({
            productId: product.id,
            customerId: null,
            reviewerName: payload.reviewer_name,
            reviewerEmail: payload.reviewer_email,
            body: payload.body,
            rating: payload.rating,
            status: "pending",
            verified: false,
        });
        ctx.response.status(201);
        return resource(ProductReviewTransformer.transform(review));
    }
}
