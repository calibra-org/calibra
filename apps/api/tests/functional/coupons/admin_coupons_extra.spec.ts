import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { CouponFactory } from "#factories/coupon_factory";
import Coupon from "#models/coupon";
import Customer from "#models/customer";
import User from "#models/user";
import { createTaxableProduct } from "#tests/helpers/cart";
import { truncatePhase03Tables } from "#tests/helpers/db";
import { resetPhase05 } from "#tests/helpers/orders";

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

async function resetCoupons() {
    await resetPhase05();
    await db.rawQuery("TRUNCATE TABLE coupon_redemptions, coupon_brand_constraints, coupon_category_constraints, coupon_product_constraints, coupon_email_restrictions, coupon_translations, coupons RESTART IDENTITY CASCADE");
    await truncatePhase03Tables();
}

test.group("GET /api/v1/admin/coupons/counts", (group) => {
    group.each.setup(resetCoupons);

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/coupons/counts");
        response.assertStatus(401);
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await createPlain();
        const response = await client.get("/api/v1/admin/coupons/counts").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("buckets coupons by tab predicate", async ({ client, assert }) => {
        const admin = await createAdmin();

        const now = DateTime.utc();
        /** Live + active. */
        await CouponFactory.merge({ status: "active", startsAt: null, expiresAt: null, code: "ACTIVE1" }).create();
        /** Disabled. */
        await CouponFactory.merge({ status: "disabled", code: "DISABLED1" }).create();
        /** Expired. */
        await CouponFactory.merge({ status: "active", expiresAt: now.minus({ days: 1 }), code: "EXPIRED1" }).create();
        /** Scheduled. */
        await CouponFactory.merge({ status: "active", startsAt: now.plus({ days: 5 }), code: "SCHED1" }).create();
        /** Trashed. */
        await CouponFactory.merge({ status: "active", deletedAt: now, code: "TRASH1" }).create();
        /** Expiring soon (within 7 days). */
        await CouponFactory.merge({ status: "active", expiresAt: now.plus({ days: 3 }), code: "SOON1" }).create();

        const response = await client.get("/api/v1/admin/coupons/counts").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const data = response.body().data as Record<string, number>;
        assert.equal(data.disabled, 1);
        assert.equal(data.expired, 1);
        assert.equal(data.scheduled, 1);
        assert.equal(data.trashed, 1);
        assert.equal(data.expiring_soon, 1);
        /** `all` excludes trashed; `active` = live + within window (which our "ACTIVE1" + "SOON1" satisfy). */
        assert.isAtLeast(data.all, 5);
        assert.isAtLeast(data.active, 2);
    });
});

test.group("GET /api/v1/admin/coupons/code-check", (group) => {
    group.each.setup(resetCoupons);

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/coupons/code-check").qs({ code: "X" });
        response.assertStatus(401);
    });

    test("returns available=true when no coupon claims the code", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client
            .get("/api/v1/admin/coupons/code-check")
            .qs({ code: "NEVERSEEN" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { available: boolean; suggestion: string | null } };
        assert.equal(body.data.available, true);
        assert.equal(body.data.suggestion, null);
    });

    test("returns available=false plus a -2 suggestion when the code is taken", async ({ client, assert }) => {
        const admin = await createAdmin();
        await CouponFactory.merge({ code: "WELCOME" }).create();

        const response = await client
            .get("/api/v1/admin/coupons/code-check")
            .qs({ code: "welcome" })
            .withGuard("api")
            .loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { available: boolean; suggestion: string | null } };
        assert.equal(body.data.available, false);
        assert.equal(body.data.suggestion, "WELCOME-2");
    });

    test("returns invalid_length when below the 2-char floor", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client
            .get("/api/v1/admin/coupons/code-check")
            .qs({ code: "A" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        const body = response.body() as { data: { available: boolean; reason?: string } };
        assert.equal(body.data.available, false);
        assert.equal(body.data.reason, "invalid_length");
    });
});

test.group("POST /api/v1/admin/coupons/:id/test", (group) => {
    group.each.setup(resetCoupons);

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client
            .post("/api/v1/admin/coupons/1/test")
            .json({ line_items: [{ product_id: 1, quantity: 1 }] });
        response.assertStatus(401);
    });

    test("returns 404 when the coupon is unknown", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client
            .post("/api/v1/admin/coupons/9999/test")
            .json({ line_items: [{ product_id: 1, quantity: 1 }] })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(404);
    });

    test("returns eligible + a calculation block on the happy path", async ({ client, assert }) => {
        const admin = await createAdmin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const coupon = await CouponFactory.merge({
            code: "PCT10",
            discountType: "percent",
            amountPercent: "10",
            amountMinor: null,
            status: "active",
            startsAt: null,
            expiresAt: null,
        }).create();

        const response = await client
            .post(`/api/v1/admin/coupons/${coupon.id}/test`)
            .json({
                line_items: [{ product_id: Number(product.id), quantity: 2 }],
                country: "IR",
            })
            .withGuard("api")
            .loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as {
            data: { eligible: boolean; calculation?: { items_subtotal_minor: number; discount_minor: number } };
        };
        assert.equal(body.data.eligible, true);
        assert.equal(body.data.calculation?.items_subtotal_minor, 2_000_000);
        assert.equal(body.data.calculation?.discount_minor, 200_000);
    });

    test("returns ineligible + reason when the coupon is disabled", async ({ client, assert }) => {
        const admin = await createAdmin();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const coupon = await CouponFactory.merge({
            code: "OFF",
            discountType: "percent",
            amountPercent: "10",
            amountMinor: null,
            status: "disabled",
        }).create();

        const response = await client
            .post(`/api/v1/admin/coupons/${coupon.id}/test`)
            .json({ line_items: [{ product_id: Number(product.id), quantity: 1 }] })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { eligible: boolean; reason?: string } };
        assert.equal(body.data.eligible, false);
        assert.equal(body.data.reason, "disabled");
    });

    test("never writes to coupon_redemptions", async ({ client, assert }) => {
        const admin = await createAdmin();
        const product = await createTaxableProduct({ regularPrice: 500_000 });
        const coupon = await CouponFactory.merge({
            code: "DRY1",
            discountType: "percent",
            amountPercent: "5",
            amountMinor: null,
            status: "active",
        }).create();

        await client
            .post(`/api/v1/admin/coupons/${coupon.id}/test`)
            .json({ line_items: [{ product_id: Number(product.id), quantity: 1 }] })
            .withGuard("api")
            .loginAs(admin);

        const rows = await Coupon.query()
            .where("id", Number(coupon.id))
            .withCount("redemptions")
            .firstOrFail();
        const count = Number((rows as unknown as { $extras: { redemptions_count: string | number } }).$extras.redemptions_count);
        assert.equal(count, 0);
    });
});

test.group("GET /api/v1/admin/coupons/export", (group) => {
    group.each.setup(resetCoupons);

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/coupons/export");
        response.assertStatus(401);
    });

    test("returns CSV with one header row + one data row per coupon", async ({ client, assert }) => {
        const admin = await createAdmin();
        await CouponFactory.merge({ code: "ALPHA", discountType: "percent", amountPercent: "10" }).create();
        await CouponFactory.merge({ code: "BETA", discountType: "fixed_cart", amountMinor: 50_000, amountPercent: null }).create();

        const response = await client.get("/api/v1/admin/coupons/export").withGuard("api").loginAs(admin);
        response.assertStatus(200);

        const body = response.text();
        const lines = body.split("\n").filter((line) => line.length > 0);
        /** Header + 2 rows = 3 lines. */
        assert.equal(lines.length, 3);
        assert.match(lines[0], /^id,code,status/);
        assert.match(body, /ALPHA/);
        assert.match(body, /BETA/);

        assert.equal(response.header("x-coupon-export-count"), "2");
        assert.match(response.header("content-type") ?? "", /text\/csv/);
        assert.match(response.header("content-disposition") ?? "", /attachment; filename=/);
    });

    test("filters by search and discount_type", async ({ client, assert }) => {
        const admin = await createAdmin();
        await CouponFactory.merge({ code: "FREESHIP", discountType: "free_shipping", amountPercent: null }).create();
        await CouponFactory.merge({ code: "TENOFF", discountType: "percent", amountPercent: "10" }).create();

        const filtered = await client
            .get("/api/v1/admin/coupons/export")
            .qs({ discount_type: "percent" })
            .withGuard("api")
            .loginAs(admin);
        filtered.assertStatus(200);
        const body = filtered.text();
        assert.notMatch(body, /FREESHIP/);
        assert.match(body, /TENOFF/);
    });
});
