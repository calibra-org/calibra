import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { CouponFactory } from "#factories/coupon_factory";
import { createTaxableProduct, resetWithFoundation } from "#tests/helpers/cart";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") {
        throw new Error("expected cart_token cookie on response");
    }
    return cookie.value;
}

test.group("POST /api/v1/cart/coupons", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
        await db.rawQuery("TRUNCATE TABLE coupons, coupon_redemptions RESTART IDENTITY CASCADE");
    });

    test("apply a valid coupon and see totals reduced", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "P10", amountPercent: "10.00" }).create();

        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const before = added.body().data.totals;

        const applied = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "P10" });

        applied.assertStatus(200);
        applied.assertAgainstApiSpec();
        const after = applied.body().data;
        assert.equal(after.applied_coupons.length, 1);
        assert.equal(after.applied_coupons[0].code, "P10");
        assert.equal(after.totals.discount_total, 100_000);
        assert.isAtMost(after.totals.grand_total, before.grand_total);
    });

    test("unknown code returns 404 with the localized message", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);

        const result = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "NOPE" });
        result.assertStatus(404);
        assert.equal(result.body().error, "not_found");
    });

    test("disabled coupon returns 422 with reason=disabled", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "OFF", status: "disabled" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const result = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "OFF" });
        result.assertStatus(422);
        assert.equal(result.body().error, "disabled");
    });

    test("expired coupon returns 422 with reason=expired", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({
            code: "OLD",
            expiresAt: DateTime.utc().minus({ days: 1 }),
        }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const result = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "OLD" });
        result.assertStatus(422);
        assert.equal(result.body().error, "expired");
    });

    test("below_minimum returns 422 with the configured floor as hint", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await CouponFactory.merge({ code: "MIN5M", minimumAmount: 5_000_000 }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const result = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "MIN5M" });
        result.assertStatus(422);
        assert.equal(result.body().error, "below_minimum");
        assert.equal(result.body().hint, "5000000");
    });

    test("applying the same code twice is idempotent", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "DUP", amountPercent: "5.00" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const a = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "DUP" });
        a.assertStatus(200);
        a.assertAgainstApiSpec();
        const b = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "DUP" });
        b.assertStatus(200);
        b.assertAgainstApiSpec();
        assert.equal(b.body().data.applied_coupons.length, 1);
    });

    test("case-insensitive lookup resolves welcome10 to WELCOME10", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "WELCOME10", amountPercent: "10.00" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);
        const applied = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "welcome10" });
        applied.assertStatus(200);
        applied.assertAgainstApiSpec();
        assert.equal(applied.body().data.applied_coupons[0].code, "WELCOME10");
    });
});
