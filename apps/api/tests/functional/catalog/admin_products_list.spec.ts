import { test } from "@japa/runner";
import { truncateAndCleanup } from "#tests/helpers/truncate";

import { createAdmin, createBrand, createCategory, createProduct, createTag } from "./helpers.js";
import InventoryItem from "#models/inventory_item";

/**
 * Regression coverage for the `category` / `tag` / `brand` / `on_sale` / `stock_status` query
 * filters on `GET /api/v1/admin/products`. The OpenAPI spec declared these params from day one,
 * but the controller silently dropped them so every admin list returned the global total —
 * server-repos category/tag/brand pages all showed the same count. These tests pin the fix in.
 */
test.group("Admin products list filters", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.each.setup(async () => {
        const cleanup = await truncateAndCleanup();
        admin = await createAdmin();
        return cleanup;
    });

    test("default request returns the paginated envelope", async ({ client, assert }) => {
        await createProduct({ fa: { name: "اول" }, en: { name: "First" } });
        await createProduct({ fa: { name: "دوم" }, en: { name: "Second" } });
        const response = await client.get("/api/v1/admin/products").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 2);
        assert.equal(response.body().data.length, 2);
    });

    test("limit constrains the page size via the TableView grammar", async ({ client, assert }) => {
        await createProduct({ fa: { name: "الف" }, en: { name: "A" } });
        await createProduct({ fa: { name: "ب" }, en: { name: "B" } });
        await createProduct({ fa: { name: "ج" }, en: { name: "C" } });
        const single = await client.get("/api/v1/admin/products?limit=1").withGuard("api").loginAs(admin);
        const couple = await client.get("/api/v1/admin/products?limit=2").withGuard("api").loginAs(admin);
        assert.equal(single.body().meta.limit, 1);
        assert.equal(single.body().data.length, 1);
        assert.equal(couple.body().meta.limit, 2);
        assert.equal(couple.body().data.length, 2);
    });

    test("category=<id> filters by category link", async ({ client, assert }) => {
        const matching = await createProduct({ fa: { name: "مطابق" }, en: { name: "Match" } });
        await createProduct({ fa: { name: "غیر" }, en: { name: "NoMatch" } });
        const category = await createCategory({
            fa: { name: "گوشی" },
            en: { name: "Phones" },
            products: [matching],
        });
        const response = await client
            .get(`/api/v1/admin/products?category=${Number(category.id)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].id, Number(matching.id));
    });

    test("unknown category id returns an empty page (not the global total)", async ({ client, assert }) => {
        await createProduct({ fa: { name: "تنها" }, en: { name: "Lonely" } });
        const response = await client.get("/api/v1/admin/products?category=999999").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 0);
        assert.equal(response.body().data.length, 0);
    });

    test("tag=<id> filters by tag link", async ({ client, assert }) => {
        const tagged = await createProduct({ fa: { name: "برچسب" }, en: { name: "Tagged" } });
        await createProduct({ fa: { name: "بدون" }, en: { name: "Untagged" } });
        const tag = await createTag({
            fa: { name: "ویژه", slug: "vije-admin" },
            en: { name: "Special", slug: "special-admin" },
        });
        await tag.related("products").attach([String(tagged.id)]);
        const response = await client
            .get(`/api/v1/admin/products?tag=${Number(tag.id)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].id, Number(tagged.id));
    });

    test("brand=<id> filters by brand link", async ({ client, assert }) => {
        const branded = await createProduct({ fa: { name: "برند" }, en: { name: "Branded" } });
        await createProduct({ fa: { name: "بی‌برند" }, en: { name: "Unbranded" } });
        const brand = await createBrand({
            fa: { name: "کلیربا", slug: "kalibra-admin" },
            en: { name: "Calibra", slug: "calibra-admin" },
        });
        await brand.related("products").attach([String(branded.id)]);
        const response = await client
            .get(`/api/v1/admin/products?brand=${Number(brand.id)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].id, Number(branded.id));
    });

    test("on_sale returns only products with a sale price", async ({ client, assert }) => {
        const onSale = await createProduct({
            fa: { name: "حراج" },
            en: { name: "Sale" },
            regularPrice: 2_000_000,
            salePrice: 1_500_000,
        });
        await createProduct({ fa: { name: "بدون حراج" }, en: { name: "Regular" }, regularPrice: 2_000_000 });
        const response = await client.get("/api/v1/admin/products?on_sale=1").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].id, Number(onSale.id));
    });

    test("stock_status filters via inventory_items join", async ({ client, assert }) => {
        const inStock = await createProduct({ fa: { name: "موجود" }, en: { name: "InStock" } });
        const outOfStock = await createProduct({ fa: { name: "ناموجود" }, en: { name: "OutOfStock" } });
        await InventoryItem.create({
            productId: inStock.id,
            stockQuantity: 10,
            manageStock: true,
            backorders: "no",
            stockStatus: "instock",
        });
        await InventoryItem.create({
            productId: outOfStock.id,
            stockQuantity: 0,
            manageStock: true,
            backorders: "no",
            stockStatus: "outofstock",
        });
        const response = await client.get("/api/v1/admin/products?stock_status=outofstock").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].id, Number(outOfStock.id));
    });

    test("category=<a>,<b> (multi-select) returns the union of both categories", async ({ client, assert }) => {
        const inA = await createProduct({ fa: { name: "آ" }, en: { name: "InA" } });
        const inB = await createProduct({ fa: { name: "ب" }, en: { name: "InB" } });
        await createProduct({ fa: { name: "ج" }, en: { name: "Neither" } });
        const catA = await createCategory({ fa: { name: "دسته آ" }, en: { name: "Cat A" }, products: [inA] });
        const catB = await createCategory({ fa: { name: "دسته ب" }, en: { name: "Cat B" }, products: [inB] });
        const response = await client
            .get(`/api/v1/admin/products?category=${Number(catA.id)},${Number(catB.id)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 2);
        const ids = response
            .body()
            .data.map((r: { id: number }) => r.id)
            .sort((x: number, y: number) => x - y);
        assert.deepEqual(
            ids,
            [Number(inA.id), Number(inB.id)].sort((x, y) => x - y),
        );
    });

    test("list rows expose category / tag / brand refs with resolved names", async ({ client, assert }) => {
        const product = await createProduct({ fa: { name: "ابزار دستی" }, en: { name: "Hand Tool" } });
        const category = await createCategory({ fa: { name: "ابزار" }, en: { name: "Tools" }, products: [product] });
        const tag = await createTag({ fa: { name: "نو", slug: "no-tax" }, en: { name: "New", slug: "new-tax" } });
        const brand = await createBrand({ fa: { name: "آکمه", slug: "acme-fa" }, en: { name: "Acme", slug: "acme-en" } });
        await tag.related("products").attach([String(product.id)]);
        await brand.related("products").attach([String(product.id)]);

        const response = await client
            .get("/api/v1/admin/products")
            .header("Accept-Language", "en")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const row = response.body().data.find((r: { id: number }) => r.id === Number(product.id));
        assert.isObject(row);
        assert.deepEqual(
            row.categories.map((c: { id: number; name: string }) => [c.id, c.name]),
            [[Number(category.id), "Tools"]],
        );
        assert.deepEqual(
            row.tags.map((tg: { id: number; name: string }) => [tg.id, tg.name]),
            [[Number(tag.id), "New"]],
        );
        assert.deepEqual(
            row.brands.map((b: { id: number; name: string }) => [b.id, b.name]),
            [[Number(brand.id), "Acme"]],
        );
    });

    test("stock_status=instock,outofstock (multi-select) returns the union of both statuses", async ({ client, assert }) => {
        const a = await createProduct({ fa: { name: "م" }, en: { name: "In" } });
        const b = await createProduct({ fa: { name: "ن" }, en: { name: "Out" } });
        const c = await createProduct({ fa: { name: "پ" }, en: { name: "Back" } });
        await InventoryItem.create({
            productId: a.id,
            stockQuantity: 5,
            manageStock: true,
            backorders: "no",
            stockStatus: "instock",
        });
        await InventoryItem.create({
            productId: b.id,
            stockQuantity: 0,
            manageStock: true,
            backorders: "no",
            stockStatus: "outofstock",
        });
        await InventoryItem.create({
            productId: c.id,
            stockQuantity: 0,
            manageStock: true,
            backorders: "notify",
            stockStatus: "onbackorder",
        });
        const response = await client
            .get("/api/v1/admin/products?stock_status=instock,outofstock")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 2);
        const ids = response
            .body()
            .data.map((r: { id: number }) => r.id)
            .sort((x: number, y: number) => x - y);
        assert.deepEqual(
            ids,
            [Number(a.id), Number(b.id)].sort((x, y) => x - y),
        );
    });
});
