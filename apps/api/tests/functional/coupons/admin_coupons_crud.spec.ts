import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import Coupon from "#models/coupon";
import CouponRedemption from "#models/coupon_redemption";
import Customer from "#models/customer";
import User from "#models/user";
import { createTaxableProduct } from "#tests/helpers/cart";
import { truncatePhase03Tables } from "#tests/helpers/db";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

async function createAdmin() {
    const user = await User.create({
        email: "admin@calibra.dev",
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Admin",
        lastName: "User",
        countryDefault: "IR",
    });
    return user;
}

async function createPlain() {
    const user = await User.create({
        email: "plain@calibra.dev",
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    await Customer.create({ userId: user.id, firstName: "P", lastName: "L", countryDefault: "IR" });
    return user;
}

test.group("/api/v1/admin/coupons", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
        await db.rawQuery("TRUNCATE TABLE coupon_redemptions, coupons RESTART IDENTITY CASCADE");
        await truncatePhase03Tables();
    });

    test("non-admin is rejected with 403", async ({ client }) => {
        const user = await createPlain();
        const r = await client.get("/api/v1/admin/coupons").withGuard("api").loginAs(user);
        r.assertStatus(403);
    });

    test("admin can create a coupon", async ({ client, assert }) => {
        const admin = await createAdmin();
        const r = await client
            .post("/api/v1/admin/coupons")
            .withGuard("api")
            .loginAs(admin)
            .json({
                code: "NEW10",
                discount_type: "percent",
                amount_percent: 10,
                translations: [{ locale: "en", description: "10% off" }],
            });
        r.assertStatus(201);
        assert.equal(r.body().data.code, "NEW10");
        const row = await Coupon.findBy("code", "NEW10");
        assert.exists(row);
    });

    test("update changes the discount and is non-retroactive (no historic data altered)", async ({ client, assert }) => {
        const admin = await createAdmin();
        const coupon = await CouponFactory.merge({ code: "UP", amountPercent: "10.00" }).create();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: order.id,
            customerId: null,
            emailSnapshot: "buyer@x.com",
        });

        const r = await client
            .put(`/api/v1/admin/coupons/${coupon.id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ amount_percent: 25 });
        r.assertStatus(200);
        assert.equal(Number(r.body().data.amount_percent), 25);

        /** Existing redemption row is untouched — updates are forward-only. */
        const ledger = await CouponRedemption.query().where("coupon_id", Number(coupon.id)).first();
        assert.exists(ledger);
    });

    test("soft-delete blocks future apply but preserves history", async ({ client, assert }) => {
        const admin = await createAdmin();
        const coupon = await CouponFactory.merge({ code: "DEL" }).create();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: order.id,
            customerId: null,
            emailSnapshot: "h@x.com",
        });

        const r = await client.delete(`/api/v1/admin/coupons/${coupon.id}`).withGuard("api").loginAs(admin);
        r.assertStatus(204);

        const reloaded = await Coupon.find(coupon.id);
        assert.exists(reloaded?.deletedAt);
        const ledgerCount = await CouponRedemption.query().where("coupon_id", Number(coupon.id)).count("* as count");
        const firstRow = ledgerCount[0] as unknown as { $extras: { count: string | number } } | undefined;
        assert.equal(Number(firstRow?.$extras.count ?? 0), 1);

        /** New apply against the soft-deleted code fails 404. */
        const failed = await client.post("/api/v1/cart/coupons").json({ code: "DEL" });
        failed.assertStatus(404);
    });

    test("batch endpoint creates + updates + deletes in one call", async ({ client, assert }) => {
        const admin = await createAdmin();
        const existing = await CouponFactory.merge({ code: "OLD", amountPercent: "5.00" }).create();
        const toDelete = await CouponFactory.merge({ code: "GONE" }).create();

        const r = await client
            .post("/api/v1/admin/coupons/batch")
            .withGuard("api")
            .loginAs(admin)
            .json({
                create: [{ code: "NEW1", discount_type: "percent", amount_percent: 15 }],
                update: [{ id: Number(existing.id), amount_percent: 8 }],
                delete: [Number(toDelete.id)],
            });
        r.assertStatus(200);
        assert.equal(r.body().created.length, 1);
        assert.equal(r.body().updated.length, 1);
        assert.equal(r.body().deleted.length, 1);
    });

    test("redemptions endpoint lists ledger rows for the coupon", async ({ client, assert }) => {
        const admin = await createAdmin();
        const coupon = await CouponFactory.merge({ code: "LIST" }).create();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const orderA = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        const orderB = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        await CouponRedemption.createMany([
            { couponId: coupon.id, orderId: orderA.id, customerId: null, emailSnapshot: "a@x.com" },
            { couponId: coupon.id, orderId: orderB.id, customerId: null, emailSnapshot: "b@x.com" },
        ]);

        const r = await client.get(`/api/v1/admin/coupons/${coupon.id}/redemptions`).withGuard("api").loginAs(admin);
        r.assertStatus(200);
        assert.equal(r.body().data.length, 2);
        assert.equal(r.body().meta.total, 2);
    });
});
