import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import CouponRedemption from "#models/coupon_redemption";
import { countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";

/**
 * These tests target the race-safe redemption ledger. The order_finalizer integration in phase 05
 * will wrap the same primitives — locking the coupon row, counting redemptions, inserting on
 * success — inside the larger submit transaction. We test the primitives directly here so phase 05
 * can land independently with the same guarantees.
 */
test.group("Redemption concurrency", (group) => {
    group.each.setup(async () => {
        await db.rawQuery("TRUNCATE TABLE coupon_redemptions, coupons, customers RESTART IDENTITY CASCADE");
    });

    test("UNIQUE (coupon_id, order_id) prevents the same order from double-writing", async ({ assert }) => {
        const coupon = await CouponFactory.merge({ code: "RACE1" }).create();
        await CouponRedemption.create({
            couponId: coupon.id,
            orderId: 1,
            customerId: null,
            emailSnapshot: "a@example.com",
        });

        let failed = false;
        try {
            await CouponRedemption.create({
                couponId: coupon.id,
                orderId: 1,
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

        const claim = async (orderId: number) => {
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

        const [a, b] = await Promise.allSettled([claim(101), claim(102)]);
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

        await CouponRedemption.create({ couponId, orderId: 1, customerId: idA, emailSnapshot: "x@a.com" });
        await CouponRedemption.create({ couponId, orderId: 2, customerId: null, emailSnapshot: "guest@a.com" });
        await CouponRedemption.create({ couponId, orderId: 3, customerId: idB, emailSnapshot: "other@a.com" });

        const matchByCustomer = await countRedemptions(couponId, { customerId: idA, email: "unused@x.com" });
        assert.equal(matchByCustomer, 1);

        const matchByEmail = await countRedemptions(couponId, { customerId: null, email: "guest@a.com" });
        assert.equal(matchByEmail, 1);

        const matchByEither = await countRedemptions(couponId, { customerId: idA, email: "guest@a.com" });
        assert.equal(matchByEither, 2);
    });
});
