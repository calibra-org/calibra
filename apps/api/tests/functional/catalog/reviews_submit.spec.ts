import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createProduct } from "./helpers.js";
import ProductReview from "#models/product_review";

test.group("Product reviews", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("anonymous submit lands as pending", async ({ client, assert }) => {
        const product = await createProduct({
            fa: { name: "محصول ریویو", slug: "review-fa" },
            en: { name: "Review Product", slug: "review-en" },
        });
        const response = await client.post(`/api/v1/products/${product.id}/reviews`).json({
            reviewer_name: "Ali",
            reviewer_email: "ali@example.com",
            body: "Great product, I really love it!",
            rating: 5,
        });
        response.assertStatus(201);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.status, "pending");
        const row = await ProductReview.findOrFail(response.body().data.id);
        assert.isNull(row.customerId);
    });

    test("rating outside 1..5 fails validation with 422", async ({ client }) => {
        const product = await createProduct({ fa: { name: "ریت", slug: "rate-fa" }, en: { name: "Rate", slug: "rate-en" } });
        const response = await client.post(`/api/v1/products/${product.id}/reviews`).json({
            reviewer_name: "Bob",
            reviewer_email: "bob@example.com",
            body: "Long enough body text here.",
            rating: 7,
        });
        response.assertStatus(422);
    });

    test("public list omits non-approved reviews", async ({ client, assert }) => {
        const product = await createProduct({ fa: { name: "لیست", slug: "list-fa" }, en: { name: "List", slug: "list-en" } });
        await ProductReview.create({
            productId: product.id,
            customerId: null,
            reviewerName: "Pending",
            reviewerEmail: "p@example.com",
            body: "Pending review body",
            rating: 4,
            status: "pending",
            verified: false,
        });
        await ProductReview.create({
            productId: product.id,
            customerId: null,
            reviewerName: "Approved",
            reviewerEmail: "a@example.com",
            body: "Approved review body",
            rating: 5,
            status: "approved",
            verified: false,
        });
        const response = await client.get(`/api/v1/products/${product.id}/reviews`);
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].reviewer_name, "Approved");
    });
});
