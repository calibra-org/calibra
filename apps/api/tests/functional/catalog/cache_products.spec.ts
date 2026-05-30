import cache from "@adonisjs/cache/services/main";
import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createProduct } from "./helpers.js";
import Product from "#models/product";
import ProductTranslation from "#models/product_translation";
import { CacheTags } from "#services/cache_keys";

/**
 * Cache behaviour for the storefront catalog endpoints. Strategy:
 *  1. Cold miss → response includes data, cache populated.
 *  2. Warm hit → mutate DB directly (bypassing the controllers' invalidation), confirm response
 *     still returns the cached value (proves the factory didn't run again).
 *  3. Tag invalidate → call `cache.deleteByTag` (or trigger a controller write) and confirm the
 *     next response reflects the DB change.
 *  4. Spec assertion runs on every successful response so the cached payload stays schema-honest.
 */
test.group("Catalog storefront caching", (group) => {
    group.each.setup(async () => {
        /**
         * The strict `data.length === 1` assertion in the very first test would fall over if
         * the previous spec in this Japa process left rows behind. `testUtils.db().truncate()`
         * only registers the cleanup on the test's teardown, so under sharding (when the prior
         * spec uses {@link resetWithFoundation}, which doesn't truncate the catalog) this group's
         * first test would inherit dirty state. Run the cleanup at setup time too — cheap, and
         * makes the assertion self-contained.
         */
        const truncate = await testUtils.db().truncate();
        await truncate();
        return truncate;
    });

    test("products list — cold miss populates, warm hit hides direct DB change, tag invalidation refreshes", async ({
        client,
        assert,
    }) => {
        const product = await createProduct({
            fa: { name: "محصول الف", slug: "alef" },
            en: { name: "Original", slug: "original" },
        });

        const first = await client.get("/api/v1/products").header("Accept-Language", "en");
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data.length, 1);
        assert.equal(first.body().data[0].name, "Original");

        await ProductTranslation.query()
            .where("product_id", String(product.id))
            .where("locale", "en")
            .update({ name: "MutatedDirectly" });

        const warm = await client.get("/api/v1/products").header("Accept-Language", "en");
        warm.assertStatus(200);
        warm.assertAgainstApiSpec();
        assert.equal(warm.body().data[0].name, "Original", "warm hit should return the cached payload, not the mutated row");

        await cache.deleteByTag({ tags: [CacheTags.catalogProducts] });

        const refreshed = await client.get("/api/v1/products").header("Accept-Language", "en");
        refreshed.assertStatus(200);
        refreshed.assertAgainstApiSpec();
        assert.equal(refreshed.body().data[0].name, "MutatedDirectly");
    });

    test("products list — fa and en don't share a cache slot", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "نسخه فارسی", slug: "fa-only" },
            en: { name: "EnglishVersion", slug: "en-only" },
        });

        const fa = await client.get("/api/v1/products").header("Accept-Language", "fa");
        assert.equal(fa.body().data[0].name, "نسخه فارسی");
        const en = await client.get("/api/v1/products").header("Accept-Language", "en");
        assert.equal(en.body().data[0].name, "EnglishVersion");
    });

    test("products list — search bypasses cache entirely", async ({ client, assert }) => {
        const product = await createProduct({
            fa: { name: "تست جستجو", slug: "search-fa" },
            en: { name: "SearchProbe", slug: "search-en" },
        });

        const first = await client.get("/api/v1/products?search=SearchProbe").header("Accept-Language", "en");
        first.assertStatus(200);
        assert.equal(first.body().data.length, 1);

        await ProductTranslation.query()
            .where("product_id", String(product.id))
            .where("locale", "en")
            .update({ name: "Renamed", slug: "renamed" });

        const second = await client.get("/api/v1/products?search=SearchProbe").header("Accept-Language", "en");
        assert.equal(second.body().data.length, 0, "search should not be cached — direct DB rename hides the row");
    });

    test("products detail — cached per product-id tag", async ({ client, assert }) => {
        const product = await createProduct({
            fa: { name: "تفصیلی", slug: "detail-fa" },
            en: { name: "Detail", slug: "detail-en" },
        });

        const first = await client.get("/api/v1/products/detail-en").header("Accept-Language", "en");
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data.name, "Detail");

        await ProductTranslation.query()
            .where("product_id", String(product.id))
            .where("locale", "en")
            .update({ name: "Mutated", slug: "detail-en" });

        const warm = await client.get("/api/v1/products/detail-en").header("Accept-Language", "en");
        assert.equal(warm.body().data.name, "Detail", "detail should be cached");

        await cache.deleteByTag({ tags: [CacheTags.catalogProduct(product.id)] });

        const refreshed = await client.get("/api/v1/products/detail-en").header("Accept-Language", "en");
        assert.equal(refreshed.body().data.name, "Mutated");
    });

    test("variations — cached + invalidated per product-id tag", async ({ client, assert }) => {
        const product = await Product.create({
            type: "variable",
            sku: "VAR-1",
            status: "publish",
            catalogVisibility: "visible",
            featured: false,
            virtual: false,
            downloadable: false,
            regularPrice: 1_000_000,
            taxStatus: "taxable",
            soldIndividually: false,
            reviewsAllowed: true,
            menuOrder: 0,
            attributes: {},
        });
        await ProductTranslation.create({
            productId: product.id,
            locale: "en",
            name: "Variable Parent",
            slug: "variable-parent",
            description: "Variable",
            shortDescription: "Variable",
            purchaseNote: null,
            externalButtonText: null,
        });

        const first = await client.get(`/api/v1/products/${Number(product.id)}/variations`).header("Accept-Language", "en");
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data.length, 0);

        const variation = await product.related("variations").create({
            sku: "VAR-1-A",
            regularPrice: 999,
            salePrice: null,
            weightGrams: null,
            lengthMm: null,
            widthMm: null,
            heightMm: null,
            imageMediaId: null,
            virtual: false,
            downloadable: false,
            taxClassId: null,
            manageStockMode: "own",
            menuOrder: 0,
            attributes: {},
        });
        void variation;

        const warm = await client.get(`/api/v1/products/${Number(product.id)}/variations`).header("Accept-Language", "en");
        assert.equal(warm.body().data.length, 0, "variations should be cached and not reflect the new row");

        await cache.deleteByTag({ tags: [CacheTags.catalogProduct(product.id)] });

        const refreshed = await client.get(`/api/v1/products/${Number(product.id)}/variations`).header("Accept-Language", "en");
        assert.equal(refreshed.body().data.length, 1);
    });
});
