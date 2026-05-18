import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import CouponRedemption from "#models/coupon_redemption";
import { countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

/**
 * Race-safe redemption ledger primitives that `order_finalizer.writeRedemptionLedger` wraps inside
 * the larger submit transaction. The FK to `orders.id` (added by the phase-05 merge migration)
 * means every test row needs a real order row — we mint one via `makeDraftOrder`.
 */
test.group("Redemption concurrency", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
        await db.rawQuery("TRUNCATE TABLE coupon_redemptions, coupons RESTART IDENTITY CASCADE");
    });

    test("UNIQUE (coupon_id, order_id) prevents the same order from double-writing", async ({ assert }) => {
        const coupon = await CouponFactory.merge({ code: "RACE1" }).create();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: order.id,
            customerId: null,
            emailSnapshot: "a@example.com",
        });

        let failed = false;
        try {
            await CouponRedemption.create({
                couponId: coupon.id,
                orderId: order.id,
                customerId: null,
                emailSnapshot: "a@example.com",
            });
        } catch (error) {
            failed = true;
            assert.match(String(error), /unique|duplicate/i);
        }
        assert.isTrue(failed, "second insert should violate the UNIQUE (coupon_id, order_id) index");

        const count = await countRedemptions(Number(coupon.id));
        assert.equal(count, 1);
    });

    test("FOR UPDATE serializes two concurrent claims for the last slot", async ({ assert }) => {
        const coupon = await CouponFactory.merge({ code: "RACE2", usageLimitGlobal: 1 }).create();
        const couponId = Number(coupon.id);
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const orderA = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        const orderB = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });

        const claim = async (orderId: bigint | number) => {
            return db.transaction(async (trx) => {
                const snapshot = await loadSnapshotForUpdate(couponId, trx);
                if (!snapshot) throw new Error("coupon vanished");
                const current = await countRedemptions(couponId, { client: trx });
                if (snapshot.usageLimitGlobal !== null && current >= snapshot.usageLimitGlobal) {
                    throw new Error("exhausted");
                }
                await CouponRedemption.create({ couponId, orderId, customerId: null, emailSnapshot: "x@y.com" }, { client: trx });
            });
        };

        const [a, b] = await Promise.allSettled([claim(orderA.id), claim(orderB.id)]);
        const fulfilled = [a, b].filter((r) => r.status === "fulfilled").length;
        const rejected = [a, b].filter((r) => r.status === "rejected").length;
        assert.equal(fulfilled, 1, "exactly one claim wins the slot");
        assert.equal(rejected, 1, "the other rolls back with exhausted");
        const count = await countRedemptions(couponId);
        assert.equal(count, 1);
    });

    test("countRedemptions scopes by customer_id OR email_snapshot", async ({ assert }) => {
        const coupon = await CouponFactory.merge({ code: "PERUSER1" }).create();
        const couponId = Number(coupon.id);
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const orderA = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        const orderB = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });
        const orderC = await makeDraftOrder({ productId: Number(product.id), quantity: 1, price: 100_000 });

        /** Real customer rows so the FK on coupon_redemptions.customer_id is satisfied. */
        const customerA = await db
            .table("customers")
            .returning("id")
            .insert({
                first_name: "A",
                last_name: "X",
                country_default: "IR",
                is_paying_customer: false,
                attributes: {},
                created_at: db.raw("now()"),
                updated_at: db.raw("now()"),
            });
        const customerB = await db
            .table("customers")
            .returning("id")
            .insert({
                first_name: "B",
                last_name: "X",
                country_default: "IR",
                is_paying_customer: false,
                attributes: {},
                created_at: db.raw("now()"),
                updated_at: db.raw("now()"),
            });
        const idA = Number((customerA[0] as { id: number | bigint }).id);
        const idB = Number((customerB[0] as { id: number | bigint }).id);

        await CouponRedemption.create({ couponId, orderId: orderA.id, customerId: idA, emailSnapshot: "x@a.com" });
        await CouponRedemption.create({ couponId, orderId: orderB.id, customerId: null, emailSnapshot: "guest@a.com" });
        await CouponRedemption.create({ couponId, orderId: orderC.id, customerId: idB, emailSnapshot: "other@a.com" });

        const matchByCustomer = await countRedemptions(couponId, { customerId: idA, email: "unused@x.com" });
        assert.equal(matchByCustomer, 1);

        const matchByEmail = await countRedemptions(couponId, { customerId: null, email: "guest@a.com" });
        assert.equal(matchByEmail, 1);

        const matchByEither = await countRedemptions(couponId, { customerId: idA, email: "guest@a.com" });
        assert.equal(matchByEither, 2);
    });
});
