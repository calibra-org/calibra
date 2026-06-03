import { test } from "@japa/runner";

import { bucketMinor, CacheKeys, CacheTags, hashFilters, tenantSegment } from "#services/cache_keys";

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
        const fa = CacheKeys.catalog.productList(1, { page: 1 }, "fa");
        const en = CacheKeys.catalog.productList(1, { page: 1 }, "en");
        assert.notEqual(fa, en);
        assert.match(fa, /:fa$/);
        assert.match(en, /:en$/);
    });

    test("per-resource tag carries the id (after the tenant segment)", ({ assert }) => {
        assert.equal(CacheTags.catalogProduct(1, 42), "t1:catalog:product:42");
        assert.equal(CacheTags.adminCustomer(1, 7), "t1:admin:customer:7");
    });

    test("settings keys + tags are tenant-namespaced and fall back to global", ({ assert }) => {
        assert.equal(CacheTags.settingsGroup("inventory"), "global:settings:inventory");
        assert.equal(CacheTags.settingsGroup("inventory", 42), "t42:settings:inventory");
        assert.equal(CacheKeys.settings.group("inventory"), "global:settings:group:inventory");
        assert.equal(CacheKeys.settings.group("inventory", 42), "t42:settings:group:inventory");
    });

    test("tenantSegment renders t<id> or global for null/undefined", ({ assert }) => {
        assert.equal(tenantSegment(42), "t42");
        assert.equal(tenantSegment("7"), "t7");
        assert.equal(tenantSegment(null), "global");
        assert.equal(tenantSegment(undefined), "global");
    });

    /**
     * The core Phase-2 isolation guarantee: every per-tenant builder embeds the tenant segment, so
     * two tenants never collide on a cache slot or tag (a collision is a cross-tenant data leak, not
     * mere staleness). One representative builder per family is checked — key AND tag — plus that the
     * emitted segment is exactly `t<id>`.
     */
    test("every per-tenant builder family produces tenant-distinct keys + tags", ({ assert }) => {
        const keyBuilders: Array<(tenantId: number) => string> = [
            (t) => CacheKeys.catalog.productList(t, { page: 1 }, "fa"),
            (t) => CacheKeys.catalog.productDetail(t, "slug", "fa"),
            (t) => CacheKeys.catalog.tags(t, "fa"),
            (t) => CacheKeys.currency.config(t, "fa"),
            (t) => CacheKeys.shipping.rates(t, { country: "IR", regionId: null, postcode: null, itemsTotalBucket: "0" }),
            (t) => CacheKeys.admin.report(t, "revenue-stats", { page: 1 }, "fa"),
            (t) => CacheKeys.admin.customerStats(t, 99),
            (t) => CacheKeys.admin.regionalProvinces(t, { page: 1 }, "fa"),
        ];
        const tagBuilders: Array<(tenantId: number) => string> = [
            (t) => CacheTags.catalogProducts(t),
            (t) => CacheTags.catalogTaxonomy(t),
            (t) => CacheTags.shippingZones(t),
            (t) => CacheTags.currency(t),
            (t) => CacheTags.adminReports(t),
            (t) => CacheTags.adminCustomers(t),
            (t) => CacheTags.regionalProvinces(t),
        ];
        for (const build of [...keyBuilders, ...tagBuilders]) {
            assert.notEqual(build(1), build(2), `${build(1)} must not collide with tenant 2`);
            assert.isTrue(build(1).startsWith("t1:"), `${build(1)} must start with the t1 segment`);
            assert.isTrue(build(2).startsWith("t2:"), `${build(2)} must start with the t2 segment`);
        }
    });
});
