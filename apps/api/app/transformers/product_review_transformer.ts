import { BaseTransformer } from "@adonisjs/core/transformers";

import type ProductReview from "#models/product_review";

export default class ProductReviewTransformer extends BaseTransformer<ProductReview> {
    toObject() {
        const r = this.resource;
        return {
            id: Number(r.id),
            product_id: Number(r.productId),
            customer_id: r.customerId === null ? null : Number(r.customerId),
            reviewer_name: r.reviewerName,
            body: r.body,
            rating: r.rating,
            status: r.status,
            verified: r.verified,
            created_at: r.createdAt?.toISO(),
        };
    }

    forAdmin() {
        const r = this.resource;
        return {
            ...this.toObject(),
            reviewer_email: r.reviewerEmail,
            updated_at: r.updatedAt?.toISO(),
        };
    }
}
