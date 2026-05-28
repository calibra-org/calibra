import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import Product from "#models/product";
import ProductReview from "#models/product_review";
import User from "#models/user";

/**
 * Functional coverage for the admin reviews moderation list. The TableView migration returned the
 * raw transformer collection as `data` instead of resolving it through `collection()`, so the
 * envelope was `{ data: { $type: "collection", … } }` — invalid against the OpenAPI schema and
 * un-mappable by the FE. `assertAgainstApiSpec()` on a populated list is what pins the fix.
 */

async function createAdmin(email = "admin@reviews.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function createCustomerUser(email = "customer@reviews.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
    return user;
}

async function resetState() {
    await db.rawQuery(`TRUNCATE TABLE "product_reviews" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "products" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
    await cache.clear();
}

async function seedReview(status: "pending" | "approved" | "rejected" = "pending") {
    const product = new Product();
    product.type = "simple";
    product.status = "publish";
    product.catalogVisibility = "visible";
    await product.save();
    const review = new ProductReview();
    review.productId = product.id;
    review.reviewerName = "Reviewer";
    review.reviewerEmail = "reviewer@example.com";
    review.body = "Solid product.";
    review.rating = 5;
    review.status = status;
    await review.save();
    return review;
}

test.group("/api/v1/admin/reviews", (group) => {
    group.each.setup(() => resetState());

    test("unauthenticated GET returns 401", async ({ client }) => {
        const res = await client.get("/api/v1/admin/reviews");
        res.assertStatus(401);
    });

    test("non-admin GET returns 403", async ({ client }) => {
        const customer = await createCustomerUser();
        const res = await client.get("/api/v1/admin/reviews").withGuard("api").loginAs(customer);
        res.assertStatus(403);
    });

    test("admin list resolves the transformer collection into a spec-valid envelope", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedReview("pending");
        await seedReview("approved");
        const res = await client.get("/api/v1/admin/reviews").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: unknown[]; meta: { total: number } };
        assert.isArray(body.data);
        assert.lengthOf(body.data, 2);
    });

    test("status filter via filter[] returns 200 and narrows", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedReview("pending");
        await seedReview("approved");
        const res = await client
            .get("/api/v1/admin/reviews")
            .qs({ "filter[]": "status:eq:pending" })
            .withGuard("api")
            .loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.lengthOf((res.body() as { data: unknown[] }).data, 1);
    });
});
