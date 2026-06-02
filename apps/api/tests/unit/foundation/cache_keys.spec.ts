import { test } from "@japa/runner";

import { bucketMinor, CacheKeys, CacheTags, hashFilters } from "#services/cache_keys";

test.group("hashFilters", () => {
    test("key order does not affect the hash (sorted, normalized inputs collide)", ({ assert }) => {
        const a = hashFilters({ category: "shoes", page: 1, brand: null });
        const b = hashFilters({ page: 1, category: "shoes" });
        assert.equal(a, b, "null/undefined keys should drop and order should not matter");
    });

    test("string casing + numeric-string vs number do not split the cache", ({ assert }) => {
        const lower = hashFilters({ category: "shoes" });
        const upper = hashFilters({ category: "SHOES" });
        assert.equal(lower, upper);

        const numericString = hashFilters({ page: "2" });
        const number = hashFilters({ page: 2 });
        assert.equal(numericString, number);
    });

    test("nested values are normalized recursively + arrays sort independent of order", ({ assert }) => {
        const a = hashFilters({ filters: { tags: ["red", "blue"] } });
        const b = hashFilters({ filters: { tags: ["blue", "red"] } });
        assert.equal(a, b);
    });

    test("returns a 12-char hex digest", ({ assert }) => {
        const result = hashFilters({ category: "shoes" });
        assert.match(result, /^[a-f0-9]{12}$/);
    });
});

test.group("bucketMinor", () => {
    test("floors values to the bucket width", ({ assert }) => {
        assert.equal(bucketMinor(0, 10_000), "0");
        assert.equal(bucketMinor(9_999, 10_000), "0");
        assert.equal(bucketMinor(10_000, 10_000), "10000");
        assert.equal(bucketMinor(19_999, 10_000), "10000");
        assert.equal(bucketMinor(20_000, 10_000), "20000");
    });

    test("negative or non-finite values bucket to 0", ({ assert }) => {
        assert.equal(bucketMinor(-1, 10_000), "0");
        assert.equal(bucketMinor(Number.NaN, 10_000), "0");
        assert.equal(bucketMinor(Number.POSITIVE_INFINITY, 10_000), "0");
    });
});

test.group("CacheKeys / CacheTags", () => {
    test("each key includes the locale segment so fa and en never collide", ({ assert }) => {
        const fa = CacheKeys.catalog.productList({ page: 1 }, "fa");
        const en = CacheKeys.catalog.productList({ page: 1 }, "en");
        assert.notEqual(fa, en);
        assert.match(fa, /:fa$/);
        assert.match(en, /:en$/);
    });

    test("per-resource tag carries the id", ({ assert }) => {
        assert.equal(CacheTags.catalogProduct(42), "catalog:product:42");
        assert.equal(CacheTags.adminCustomer(7), "admin:customer:7");
    });

    test("settings keys + tags are tenant-namespaced and fall back to global", ({ assert }) => {
        assert.equal(CacheTags.settingsGroup("inventory"), "global:settings:inventory");
        assert.equal(CacheTags.settingsGroup("inventory", 42), "t42:settings:inventory");
        assert.equal(CacheKeys.settings.group("inventory"), "global:settings:group:inventory");
        assert.equal(CacheKeys.settings.group("inventory", 42), "t42:settings:group:inventory");
    });

    test("two tenants get distinct settings keys + tags (no cross-tenant cache bleed)", ({ assert }) => {
        assert.notEqual(CacheKeys.settings.group("inventory", 1), CacheKeys.settings.group("inventory", 2));
        assert.notEqual(CacheTags.settingsGroup("inventory", 1), CacheTags.settingsGroup("inventory", 2));
    });
});
