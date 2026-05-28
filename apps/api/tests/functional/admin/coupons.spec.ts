import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#database/factories/coupon_factory";
import Customer from "#models/customer";
import User from "#models/user";

/**
 * Functional coverage for the admin coupons list. The migration to the TableView grammar moved
 * the per-column filters (`discount_type`, `free_shipping`, …) onto `filter[]` and renamed the
 * free-text param to `q` and the sort param to `sort[]`, but the FE `buildQuery` kept emitting
 * the legacy top-level keys — so the page 422'd on its very first client fetch. These tests pin
 * the exact wire shape the rebuilt `useCouponsList` / `buildQuery` now sends.
 */

async function createAdmin(email = "admin@coupons.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function createCustomerUser(email = "customer@coupons.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
    return user;
}

async function resetState() {
    await db.rawQuery(`TRUNCATE TABLE "coupon_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "coupons" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
    await cache.clear();
}

async function seedCoupons() {
    await CouponFactory.apply("percent").create();
    await CouponFactory.apply("fixedCart").create();
    await CouponFactory.apply("freeShipping").create();
    await CouponFactory.apply("disabled").create();
}

test.group("/api/v1/admin/coupons", (group) => {
    group.each.setup(() => resetState());

    test("unauthenticated GET returns 401", async ({ client }) => {
        const res = await client.get("/api/v1/admin/coupons");
        res.assertStatus(401);
    });

    test("non-admin GET returns 403", async ({ client }) => {
        const customer = await createCustomerUser();
        const res = await client.get("/api/v1/admin/coupons").withGuard("api").loginAs(customer);
        res.assertStatus(403);
    });

    test("admin lists coupons", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedCoupons();
        const res = await client.get("/api/v1/admin/coupons").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.isAtLeast((res.body() as { data: unknown[] }).data.length, 4);
    });

    test("initial client load shape (page + limit, no toggles) returns 200", async ({ client }) => {
        const admin = await createAdmin();
        await seedCoupons();
        const res = await client.get("/api/v1/admin/coupons").qs({ page: 1, limit: 25 }).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
    });

    test("full toolbar shape — q + sort[] + filter[] facets/toggles + tab + expiring_soon", async ({ client }) => {
        const admin = await createAdmin();
        await seedCoupons();
        const res = await client
            .get("/api/v1/admin/coupons")
            .qs({
                page: 1,
                limit: 25,
                q: "TEST",
                tab: "active",
                "sort[]": ["created_at:desc"],
                "filter[]": ["discount_type:in:percent,fixed_cart", "free_shipping:eq:true"],
                expiring_soon: true,
            })
            .withGuard("api")
            .loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
    });

    test("filter[]=discount_type:in narrows the result set", async ({ client, assert }) => {
        const admin = await createAdmin();
        await seedCoupons();
        const res = await client
            .get("/api/v1/admin/coupons")
            .qs({ "filter[]": "discount_type:in:free_shipping" })
            .withGuard("api")
            .loginAs(admin);
        res.assertStatus(200);
        const rows = (res.body() as { data: Array<{ discount_type: string }> }).data;
        assert.isAbove(rows.length, 0);
        assert.isTrue(rows.every((r) => r.discount_type === "free_shipping"));
    });

    test("limit cap stays at the default 100 (not a selector endpoint)", async ({ client }) => {
        const admin = await createAdmin();
        const ok = await client.get("/api/v1/admin/coupons").qs({ limit: 100 }).withGuard("api").loginAs(admin);
        ok.assertStatus(200);
        const tooBig = await client.get("/api/v1/admin/coupons").qs({ limit: 101 }).withGuard("api").loginAs(admin);
        tooBig.assertStatus(422);
    });
});
