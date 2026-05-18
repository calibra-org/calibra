import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import CouponRedemption from "#models/coupon_redemption";
import Customer from "#models/customer";
import User from "#models/user";
import { createTaxableProduct, resetWithFoundation } from "#tests/helpers/cart";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function loginUser(email: string) {
    const user = await User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: "F",
        lastName: "L",
        countryDefault: "IR",
    });
    return { user, customer };
}

test.group("usage_limit_per_user", (group) => {
    group.each.setup(async () => {
        await resetWithFoundation();
        await db.rawQuery("TRUNCATE TABLE coupons, coupon_redemptions RESTART IDENTITY CASCADE");
        await truncatePhase03Tables();
    });

    test("second apply by the same customer fails after their cap is reached", async ({ client, assert }) => {
        const coupon = await CouponFactory.merge({ code: "U1", usageLimitPerUser: 1 }).create();
        const { user, customer } = await loginUser("repeat@example.com");
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: 1,
            customerId: customer.id,
            emailSnapshot: user.email,
        });

        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client
            .post("/api/v1/cart/items")
            .withGuard("api")
            .loginAs(user)
            .json({ product_id: Number(product.id), quantity: 1 });

        const result = await client
            .post("/api/v1/cart/coupons")
            .withGuard("api")
            .loginAs(user)
            .cookie("cart_token", added.cookie("cart_token")?.value as string)
            .json({ code: "U1" });
        result.assertStatus(422);
        assert.equal(result.body().error, "usage_limit_per_user_reached");
    });

    test("a different customer is unaffected by another user's redemption count", async ({ client, assert }) => {
        const coupon = await CouponFactory.merge({ code: "U2", usageLimitPerUser: 1 }).create();
        const { customer: other } = await loginUser("other@example.com");
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: 1,
            customerId: other.id,
            emailSnapshot: "other@example.com",
        });

        const { user } = await loginUser("fresh@example.com");
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const added = await client
            .post("/api/v1/cart/items")
            .withGuard("api")
            .loginAs(user)
            .json({ product_id: Number(product.id), quantity: 1 });
        const result = await client
            .post("/api/v1/cart/coupons")
            .withGuard("api")
            .loginAs(user)
            .cookie("cart_token", added.cookie("cart_token")?.value as string)
            .json({ code: "U2" });
        result.assertStatus(200);
        assert.equal(result.body().data.applied_coupons[0].code, "U2");
    });
});
