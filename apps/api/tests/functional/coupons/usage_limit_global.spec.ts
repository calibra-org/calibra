import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import CouponRedemption from "#models/coupon_redemption";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

/**
 * Phase 05 will exercise the global limit through the order submit pipeline. Until then we test it
 * at the apply boundary: once the ledger hits `usage_limit_global` rows, the discounter's
 * eligibility check stops adding the coupon to new carts (returning 422 with the matching reason).
 */
test.group("usage_limit_global", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
        await db.rawQuery("TRUNCATE TABLE coupons, coupon_redemptions RESTART IDENTITY CASCADE");
    });

    test("ledger at the limit blocks new apply attempts with reason=usage_limit_global_reached", async ({ client, assert }) => {
        const coupon = await CouponFactory.merge({ code: "G1", usageLimitGlobal: 1 }).create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const existingOrder = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 1_000_000 });
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: existingOrder.id,
            customerId: null,
            emailSnapshot: "first@x.com",
        });

        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = added.cookie("cart_token")?.value as string;

        const result = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "G1" });
        result.assertStatus(422);
        assert.equal(result.body().error, "usage_limit_global_reached");
    });

    test("ledger below the limit allows the apply through", async ({ client, assert }) => {
        await CouponFactory.merge({ code: "G2", usageLimitGlobal: 5 }).create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = added.cookie("cart_token")?.value as string;

        const result = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "G2" });
        result.assertStatus(200);
        assert.equal(result.body().data.applied_coupons[0].code, "G2");
    });
});
