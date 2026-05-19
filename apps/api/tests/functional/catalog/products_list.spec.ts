import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { createAttributeWithTerm, createBrand, createCategory, createProduct, createTag } from "./helpers.js";
import InventoryItem from "#models/inventory_item";
import ProductAttributeLink from "#models/product_attribute_link";

test.group("GET /api/v1/products", (group) => {
    group.each.setup(async () => {
        return await testUtils.db().truncate();
    });

    test("returns a paginated envelope with default page=1 perPage=20", async ({ client, assert }) => {
        for (let i = 0; i < 5; i += 1) {
            await createProduct({
                fa: { name: `محصول الف ${i}`, slug: `slug-fa-${i}` },
                en: { name: `Product ${i}`, slug: `slug-en-${i}` },
            });
        }
        const response = await client.get("/api/v1/products");
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        response.assertBodyContains({ meta: { page: 1, perPage: 20 } });
        assert.equal(response.body().data.length, 5);
        assert.equal(response.body().meta.total, 5);
    });

    test("default sort is menu_order ascending", async ({ client, assert }) => {
        const a = await createProduct({ fa: { name: "الف", slug: "alef" }, en: { name: "Alpha", slug: "alpha" } });
        a.menuOrder = 10;
        await a.save();
        const b = await createProduct({ fa: { name: "ب", slug: "ba" }, en: { name: "Beta", slug: "beta" } });
        b.menuOrder = 1;
        await b.save();
        const response = await client.get("/api/v1/products").header("Accept-Language", "en");
        const names = response.body().data.map((p: { name: string }) => p.name);
        assert.deepEqual(names, ["Beta", "Alpha"]);
    });

    test("Accept-Language: fa returns Persian name, en returns English name", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "گوشی سامسونگ", slug: "گوشی-سامسونگ" },
            en: { name: "Samsung Phone", slug: "samsung-phone" },
        });
        const faResponse = await client.get("/api/v1/products").header("Accept-Language", "fa");
        const enResponse = await client.get("/api/v1/products").header("Accept-Language", "en");
        assert.equal(faResponse.body().data[0].name, "گوشی سامسونگ");
        assert.equal(enResponse.body().data[0].name, "Samsung Phone");
    });

    test("filters by category slug", async ({ client, assert }) => {
        const matchingProduct = await createProduct({
            fa: { name: "تطبیق", slug: "match" },
            en: { name: "Match", slug: "match-en" },
        });
        await createProduct({ fa: { name: "ناتطبیق", slug: "no-match" }, en: { name: "NoMatch", slug: "no-match-en" } });
        const category = await createCategory({
            fa: { name: "الکترونیک", slug: "الکترونیک" },
            en: { name: "Electronics", slug: "electronics" },
            products: [matchingProduct],
        });
        const response = await client.get("/api/v1/products?category=electronics").header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].id, Number(matchingProduct.id));
        // suppress unused warning
        assert.isNotNull(category);
    });

    test("filters by tag slug", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "تگ‌دار", slug: "tagged" }, en: { name: "Tagged", slug: "tagged-en" } });
        await createProduct({ fa: { name: "بدون تگ", slug: "untagged" }, en: { name: "Untagged", slug: "untagged-en" } });
        const tag = await createTag({ fa: { name: "ویژه", slug: "vije" }, en: { name: "Special", slug: "special" } });
        await tag.related("products").attach([String(p.id)]);
        const response = await client.get("/api/v1/products?tag=special").header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].id, Number(p.id));
    });

    test("filters by brand slug", async ({ client, assert }) => {
        const p = await createProduct({ fa: { name: "برند الف", slug: "brand-a" }, en: { name: "BrandA", slug: "brand-a-en" } });
        await createProduct({ fa: { name: "برند ب", slug: "brand-b" }, en: { name: "BrandB", slug: "brand-b-en" } });
        const brand = await createBrand({ fa: { name: "کلیربا", slug: "kalibra" }, en: { name: "Calibra", slug: "calibra" } });
        await brand.related("products").attach([String(p.id)]);
        const response = await client.get("/api/v1/products?brand=calibra").header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].id, Number(p.id));
    });

    test("filters by attribute + attribute_term", async ({ client, assert }) => {
        const product = await createProduct({
            fa: { name: "تی-شرت", slug: "tshirt" },
            en: { name: "T-Shirt", slug: "tshirt-en" },
        });
        await createProduct({ fa: { name: "دیگر", slug: "other" }, en: { name: "Other", slug: "other-en" } });
        const { attribute, term } = await createAttributeWithTerm({
            code: "size",
            attrFa: "سایز",
            attrEn: "Size",
            term: { fa: "ال", en: "L", slug: "l" },
        });
        const link = await ProductAttributeLink.create({
            productId: product.id,
            attributeId: attribute.id,
            position: 0,
            visible: true,
            usedForVariation: true,
        });
        await link.related("terms").attach([String(term.id)]);

        const response = await client
            .get("/api/v1/products?attribute=size&attribute_term=size-l")
            .header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].id, Number(product.id));
    });

    test("on_sale filter returns only products with a sale price", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "حراج", slug: "sale" },
            en: { name: "Sale", slug: "sale-en" },
            regularPrice: 1_000_000,
            salePrice: 800_000,
        });
        await createProduct({ fa: { name: "بدون حراج", slug: "no-sale" }, en: { name: "NoSale", slug: "no-sale-en" } });
        const response = await client.get("/api/v1/products?on_sale=1").header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].name, "Sale");
    });

    test("min_price/max_price filter products by regular price", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "ارزان", slug: "cheap" },
            en: { name: "Cheap", slug: "cheap-en" },
            regularPrice: 100_000,
        });
        await createProduct({
            fa: { name: "گران", slug: "expensive" },
            en: { name: "Expensive", slug: "expensive-en" },
            regularPrice: 50_000_000,
        });
        const response = await client
            .get("/api/v1/products?min_price=1000000&max_price=10000000")
            .header("Accept-Language", "en");
        assert.equal(response.body().data.length, 0);
    });

    test("stock_status filter joins inventory_items", async ({ client, assert }) => {
        const inStock = await createProduct({
            fa: { name: "موجود", slug: "in-stock" },
            en: { name: "InStock", slug: "in-stock-en" },
        });
        const outOfStock = await createProduct({
            fa: { name: "ناموجود", slug: "out-stock" },
            en: { name: "OutStock", slug: "out-stock-en" },
        });
        await InventoryItem.create({
            productId: inStock.id,
            variationId: null,
            locationId: null,
            stockQuantity: 10,
            manageStock: true,
            backorders: "no",
            stockStatus: "instock",
        });
        await InventoryItem.create({
            productId: outOfStock.id,
            variationId: null,
            locationId: null,
            stockQuantity: 0,
            manageStock: true,
            backorders: "no",
            stockStatus: "outofstock",
        });
        const response = await client.get("/api/v1/products?stock_status=outofstock").header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].id, Number(outOfStock.id));
    });

    test("search matches across translations (whether locale is fa or en)", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "گوشی سامسونگ", slug: "samsung-fa-search" },
            en: { name: "Samsung Phone", slug: "samsung-en-search" },
        });
        await createProduct({ fa: { name: "تلویزیون ال‌جی", slug: "lg-fa" }, en: { name: "LG TV", slug: "lg-en" } });
        const response = await client.get("/api/v1/products?search=Samsung").header("Accept-Language", "en");
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].name, "Samsung Phone");

        const _now = DateTime.utc();
        void _now;
    });
});
