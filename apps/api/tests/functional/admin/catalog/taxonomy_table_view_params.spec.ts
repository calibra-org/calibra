import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import ProductBrand from "#models/product_brand";
import ProductCategory from "#models/product_category";
import ProductTag from "#models/product_tag";
import User from "#models/user";

/**
 * Regression coverage for the TableView wire-grammar contract on the catalog taxonomy endpoints.
 * These tests lock the two classes of bug that shipped silently in the migration PR (#49):
 *
 * 1. The hardcoded `limit` ceiling of 100 rejected the `?limit=200` / `?limit=500` requests the
 *    selector / tree pickers send on purpose — every taxonomy page threw 422 on load.
 * 2. `slug` was declared on the base model and spliced into the q-search / sort SQL, but it only
 *    exists on the `*_translations` tables — `?q=`, `?sort[]=slug` and `?filter[]=slug` all 500'd.
 *
 * The suite mirrors the exact query shapes the real admin FE callers send (server-repos +
 * lib/products/queries.ts + the entity pickers) so a future regression turns a test red instead
 * of waiting for someone to click the page.
 */

async function createAdmin(email = "admin@taxonomy-params.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function resetState() {
    await db.rawQuery(`TRUNCATE TABLE "product_category_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_categories" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_tag_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_tags" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_brand_translations" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_brands" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "products" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "users" RESTART IDENTITY CASCADE`);
    await cache.clear();
}

async function seedCategory(name: string, slug: string): Promise<ProductCategory> {
    const row = new ProductCategory();
    await row.save();
    await db.table("product_category_translations").insert({ category_id: Number(row.id), locale: "fa", name, slug });
    return row;
}

async function seedTag(name: string, slug: string): Promise<ProductTag> {
    const row = new ProductTag();
    await row.save();
    await db.table("product_tag_translations").insert({ tag_id: Number(row.id), locale: "fa", name, slug });
    return row;
}

async function seedBrand(name: string, slug: string): Promise<ProductBrand> {
    const row = new ProductBrand();
    await row.save();
    await db.table("product_brand_translations").insert({ brand_id: Number(row.id), locale: "fa", name, slug });
    return row;
}

/** Endpoints whose FE callers (selector / tree pickers) legitimately request more than 100 rows. */
const SELECTOR_ENDPOINTS = [
    "/api/v1/admin/categories",
    "/api/v1/admin/tags",
    "/api/v1/admin/brands",
    "/api/v1/admin/attributes",
    "/api/v1/admin/products",
] as const;

test.group("admin taxonomy — TableView limit ceiling", (group) => {
    group.each.setup(() => resetState());

    for (const path of SELECTOR_ENDPOINTS) {
        test(`${path} accepts limit=500 (selector page size)`, async ({ client }) => {
            const admin = await createAdmin();
            const res = await client.get(`${path}?limit=500`).withGuard("api").loginAs(admin);
            res.assertStatus(200);
            res.assertAgainstApiSpec();
        });

        test(`${path} rejects limit=501 (one past the raised cap)`, async ({ client }) => {
            const admin = await createAdmin();
            const res = await client.get(`${path}?limit=501`).withGuard("api").loginAs(admin);
            res.assertStatus(422);
        });
    }
});

test.group("admin taxonomy — q-search matches translated name OR slug", (group) => {
    group.each.setup(() => resetState());

    test("categories: q matches slug and name, misses unrelated", async ({ client, assert }) => {
        const admin = await createAdmin();
        const hit = await seedCategory("Alpha Category", "bravo-slug");
        await seedCategory("Gamma Category", "delta-slug");

        const bySlug = await client.get("/api/v1/admin/categories").qs({ q: "bravo" }).withGuard("api").loginAs(admin);
        bySlug.assertStatus(200);
        bySlug.assertAgainstApiSpec();
        assert.deepEqual(
            (bySlug.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id)),
            [Number(hit.id)],
        );

        const byName = await client.get("/api/v1/admin/categories").qs({ q: "alpha" }).withGuard("api").loginAs(admin);
        byName.assertStatus(200);
        assert.deepEqual(
            (byName.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id)),
            [Number(hit.id)],
        );

        const miss = await client.get("/api/v1/admin/categories").qs({ q: "zzzzzz" }).withGuard("api").loginAs(admin);
        miss.assertStatus(200);
        assert.lengthOf((miss.body() as { data: unknown[] }).data, 0);
    });

    test("tags: q matches slug", async ({ client, assert }) => {
        const admin = await createAdmin();
        const hit = await seedTag("Alpha Tag", "bravo-tag");
        await seedTag("Gamma Tag", "delta-tag");
        const res = await client.get("/api/v1/admin/tags").qs({ q: "bravo" }).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.deepEqual(
            (res.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id)),
            [Number(hit.id)],
        );
    });

    test("brands: q matches slug", async ({ client, assert }) => {
        const admin = await createAdmin();
        const hit = await seedBrand("Alpha Brand", "bravo-brand");
        await seedBrand("Gamma Brand", "delta-brand");
        const res = await client.get("/api/v1/admin/brands").qs({ q: "bravo" }).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.deepEqual(
            (res.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id)),
            [Number(hit.id)],
        );
    });
});

test.group("admin taxonomy — slug is sort-only (translations-backed)", (group) => {
    group.each.setup(() => resetState());

    test("categories: sort[]=slug:asc orders by the translated slug", async ({ client, assert }) => {
        const admin = await createAdmin();
        const zed = await seedCategory("Zed", "zed-slug");
        const amp = await seedCategory("Amp", "amp-slug");
        const res = await client.get("/api/v1/admin/categories").qs({ "sort[]": "slug:asc" }).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const order = (res.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id));
        assert.isBelow(order.indexOf(Number(amp.id)), order.indexOf(Number(zed.id)));
    });

    test("categories: filter[]=slug rejects cleanly (422, not a 500)", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client
            .get("/api/v1/admin/categories")
            .qs({ "filter[]": "slug:like:x" })
            .withGuard("api")
            .loginAs(admin);
        res.assertStatus(422);
    });
});

test.group("admin taxonomy — entity-picker wire shapes", (group) => {
    group.each.setup(() => resetState());

    test("category picker: q search + filter[]=id:in resolve both 200", async ({ client, assert }) => {
        const admin = await createAdmin();
        const a = await seedCategory("Pick A", "pick-a");
        const b = await seedCategory("Pick B", "pick-b");

        const search = await client.get("/api/v1/admin/categories").qs({ q: "pick", limit: 50 }).withGuard("api").loginAs(admin);
        search.assertStatus(200);
        search.assertAgainstApiSpec();

        const resolve = await client
            .get("/api/v1/admin/categories")
            .qs({ "filter[]": `id:in:${a.id},${b.id}`, limit: 2 })
            .withGuard("api")
            .loginAs(admin);
        resolve.assertStatus(200);
        assert.sameMembers(
            (resolve.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id)),
            [Number(a.id), Number(b.id)],
        );
    });

    test("brand picker: filter[]=id:in resolve 200", async ({ client, assert }) => {
        const admin = await createAdmin();
        const a = await seedBrand("Pick A", "pick-a-brand");
        const res = await client
            .get("/api/v1/admin/brands")
            .qs({ "filter[]": `id:in:${a.id}`, limit: 1 })
            .withGuard("api")
            .loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.deepEqual(
            (res.body() as { data: Array<{ id: number }> }).data.map((r) => Number(r.id)),
            [Number(a.id)],
        );
    });

    test("product picker: q search shape 200", async ({ client }) => {
        const admin = await createAdmin();
        const res = await client.get("/api/v1/admin/products").qs({ q: "anything", limit: 20 }).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
    });
});
