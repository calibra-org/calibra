import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import Product from "#models/product";
import ProductBrand from "#models/product_brand";
import ProductCategory from "#models/product_category";
import ProductTag from "#models/product_tag";
import User from "#models/user";

async function createAdmin(email = "admin@taxonomy-used-count.test") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR" });
    return user;
}

async function resetState() {
    await db.rawQuery(`TRUNCATE TABLE "product_category_links" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_tag_links" RESTART IDENTITY CASCADE`);
    await db.rawQuery(`TRUNCATE TABLE "product_brand_links" RESTART IDENTITY CASCADE`);
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

async function seedCategory(name: string): Promise<ProductCategory> {
    const cat = new ProductCategory();
    await cat.save();
    await db.table("product_category_translations").insert({
        category_id: Number(cat.id),
        locale: "fa",
        name,
        slug: name,
    });
    return cat;
}

async function seedTag(name: string): Promise<ProductTag> {
    const tag = new ProductTag();
    await tag.save();
    await db.table("product_tag_translations").insert({
        tag_id: Number(tag.id),
        locale: "fa",
        name,
        slug: name,
    });
    return tag;
}

async function seedBrand(name: string): Promise<ProductBrand> {
    const brand = new ProductBrand();
    await brand.save();
    await db.table("product_brand_translations").insert({
        brand_id: Number(brand.id),
        locale: "fa",
        name,
        slug: name,
    });
    return brand;
}

async function seedProducts(count: number): Promise<Product[]> {
    const rows: Product[] = [];
    for (let i = 0; i < count; i += 1) {
        const p = new Product();
        p.type = "simple";
        p.status = "publish";
        p.catalogVisibility = "visible";
        await p.save();
        rows.push(p);
    }
    return rows;
}

test.group("admin taxonomy index — sort=-used_count (categories)", (group) => {
    group.each.setup(async () => {
        await resetState();
    });

    test("ranks categories most-used-first and surfaces used_count", async ({ client, assert }) => {
        const admin = await createAdmin();
        const popular = await seedCategory("popular");
        const middle = await seedCategory("middle");
        const empty = await seedCategory("empty");
        const products = await seedProducts(5);
        for (const p of products) {
            await db.table("product_category_links").insert({ product_id: Number(p.id), category_id: Number(popular.id) });
        }
        for (let i = 0; i < 2; i += 1) {
            await db
                .table("product_category_links")
                .insert({ product_id: Number(products[i]!.id), category_id: Number(middle.id) });
        }

        const res = await client.get("/api/v1/admin/categories?sort=-used_count").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: Array<{ id: number; used_count: number | null }> };
        const order = body.data.map((row) => row.id);
        assert.deepEqual(order.slice(0, 3), [Number(popular.id), Number(middle.id), Number(empty.id)]);
        assert.equal(body.data.find((row) => row.id === Number(popular.id))?.used_count, 5);
        assert.equal(body.data.find((row) => row.id === Number(middle.id))?.used_count, 2);
        assert.equal(body.data.find((row) => row.id === Number(empty.id))?.used_count, 0);
    });

    test("sort=used_count ranks least-used-first", async ({ client, assert }) => {
        const admin = await createAdmin();
        const popular = await seedCategory("popular");
        const empty = await seedCategory("empty");
        const products = await seedProducts(3);
        for (const p of products) {
            await db.table("product_category_links").insert({ product_id: Number(p.id), category_id: Number(popular.id) });
        }
        const res = await client.get("/api/v1/admin/categories?sort=used_count").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        const body = res.body() as { data: Array<{ id: number; used_count: number | null }> };
        const order = body.data.map((row) => row.id);
        assert.equal(order[0], Number(empty.id));
        assert.equal(order[order.length - 1], Number(popular.id));
    });

    test("default index path is unaffected and emits used_count=null", async ({ client, assert }) => {
        const admin = await createAdmin();
        const cat = await seedCategory("plain");
        const product = (await seedProducts(1))[0]!;
        await db.table("product_category_links").insert({ product_id: Number(product.id), category_id: Number(cat.id) });

        const res = await client.get("/api/v1/admin/categories").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: Array<{ id: number; used_count: number | null }> };
        assert.equal(body.data.find((row) => row.id === Number(cat.id))?.used_count, null);
    });

    test("respects perPage cap on most-used path", async ({ client, assert }) => {
        const admin = await createAdmin();
        for (let i = 0; i < 6; i += 1) await seedCategory(`c${i}`);
        const res = await client.get("/api/v1/admin/categories?sort=-used_count&perPage=3").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        const body = res.body() as { data: unknown[] };
        assert.equal(body.data.length, 3);
    });

    test("warm cache survives a fresh request and stays spec-clean", async ({ client }) => {
        const admin = await createAdmin();
        await seedCategory("alpha");
        const first = await client.get("/api/v1/admin/categories?sort=-used_count").withGuard("api").loginAs(admin);
        first.assertStatus(200);
        const second = await client.get("/api/v1/admin/categories?sort=-used_count").withGuard("api").loginAs(admin);
        second.assertStatus(200);
        second.assertAgainstApiSpec();
    });
});

test.group("admin taxonomy index — sort=-used_count (tags)", (group) => {
    group.each.setup(async () => {
        await resetState();
    });

    test("ranks tags most-used-first and surfaces used_count", async ({ client, assert }) => {
        const admin = await createAdmin();
        const hot = await seedTag("hot");
        const cold = await seedTag("cold");
        const products = await seedProducts(4);
        for (const p of products) {
            await db.table("product_tag_links").insert({ product_id: Number(p.id), tag_id: Number(hot.id) });
        }
        await db.table("product_tag_links").insert({ product_id: Number(products[0]!.id), tag_id: Number(cold.id) });

        const res = await client.get("/api/v1/admin/tags?sort=-used_count").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: Array<{ id: number; used_count: number | null }> };
        assert.equal(body.data[0]?.id, Number(hot.id));
        assert.equal(body.data[0]?.used_count, 4);
        assert.equal(body.data.find((row) => row.id === Number(cold.id))?.used_count, 1);
    });
});

test.group("admin taxonomy index — sort=-used_count (brands)", (group) => {
    group.each.setup(async () => {
        await resetState();
    });

    test("ranks brands most-used-first and surfaces used_count", async ({ client, assert }) => {
        const admin = await createAdmin();
        const a = await seedBrand("a");
        const b = await seedBrand("b");
        const products = await seedProducts(3);
        for (const p of products) {
            await db.table("product_brand_links").insert({ product_id: Number(p.id), brand_id: Number(a.id) });
        }
        await db.table("product_brand_links").insert({ product_id: Number(products[0]!.id), brand_id: Number(b.id) });

        const res = await client.get("/api/v1/admin/brands?sort=-used_count").withGuard("api").loginAs(admin);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const body = res.body() as { data: Array<{ id: number; used_count: number | null }> };
        assert.equal(body.data[0]?.id, Number(a.id));
        assert.equal(body.data[0]?.used_count, 3);
    });

    test("write invalidates the cached most-used result", async ({ client, assert }) => {
        const admin = await createAdmin();
        const a = await seedBrand("a");
        const product = (await seedProducts(1))[0]!;
        await db.table("product_brand_links").insert({ product_id: Number(product.id), brand_id: Number(a.id) });

        const first = await client.get("/api/v1/admin/brands?sort=-used_count").withGuard("api").loginAs(admin);
        first.assertStatus(200);
        const firstBody = first.body() as { data: Array<{ id: number; used_count: number | null }> };
        assert.equal(firstBody.data.find((row) => row.id === Number(a.id))?.used_count, 1);

        const create = await client
            .post("/api/v1/admin/brands")
            .json({ translations: [{ locale: "fa", name: "brand-c" }] })
            .withGuard("api")
            .loginAs(admin);
        create.assertStatus(201);

        const after = await client.get("/api/v1/admin/brands?sort=-used_count").withGuard("api").loginAs(admin);
        after.assertStatus(200);
        const afterBody = after.body() as { data: Array<{ id: number }> };
        assert.equal(afterBody.data.length, 2);
    });
});
