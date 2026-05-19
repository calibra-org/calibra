import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import { createTaxableProduct, resetWithFoundation } from "#tests/helpers/cart";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

test.group("DELETE /api/v1/cart/coupons/:code", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
        await db.rawQuery("TRUNCATE TABLE coupons, coupon_redemptions RESTART IDENTITY CASCADE");
    });

    test("removes an applied coupon and recomputes totals", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "P10" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "P10" });

        const removed = await client.delete("/api/v1/cart/coupons/P10").cookie("cart_token", token);
        removed.assertStatus(200);
        removed.assertAgainstApiSpec();
        const body = removed.body().data;
        assert.equal(body.applied_coupons.length, 0);
        assert.equal(body.totals.discount_total, 0);
    });

    test("removing a code that isn't applied returns 404", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const result = await client.delete("/api/v1/cart/coupons/NEVER").cookie("cart_token", token);
        result.assertStatus(404);
        assert.equal(result.body().error, "not_applied");
    });

    test("case-insensitive removal", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "ABC123" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "ABC123" });
        const removed = await client.delete("/api/v1/cart/coupons/abc123").cookie("cart_token", token);
        removed.assertStatus(200);
        removed.assertAgainstApiSpec();
        assert.equal(removed.body().data.applied_coupons.length, 0);
    });
});
