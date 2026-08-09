import { test } from "@japa/runner";

import { analyzeSeoEvidence } from "#services/seo/analyzer";
import {
    buildEntitySchema,
    buildOrganizationSchema,
    buildRobotsDocument,
    chunkSitemapEntries,
    filterSitemapEntries,
    serializeRobots,
} from "#services/seo/builders";
import { DEFAULT_SEO_SETTINGS, type SeoEvidence } from "#services/seo/domain";

const completeProduct = (overrides: Partial<SeoEvidence> = {}): SeoEvidence => ({
    kind: "product",
    key: "product:1",
    id: 1,
    locale: "fa",
    publicUrl: "https://example.test/fa/products/sample",
    title: "لوله آبیاری استاندارد چهار اینچ مدل حرفه‌ای",
    slug: "professional-irrigation-pipe",
    shortDescription: "محصولی برای اجرای سامانه‌های آبیاری با مشخصات فنی روشن و کاربرد عملی.",
    description:
        "این توضیح کامل محصول شامل اطلاعات نصب، موارد استفاده، نگهداری، سازگاری، انتخاب صحیح و محدودیت‌های واقعی است. ".repeat(8),
    status: "publish",
    sku: "PIPE-4-100",
    gtin: "6260000000001",
    brandCount: 1,
    categoryCount: 2,
    attributeCount: 4,
    imageCount: 3,
    imageAltCount: 3,
    priceMinor: 100_000,
    stockStatus: "instock",
    variationCount: 0,
    internalInboundCount: 2,
    profile: {
        metaTitle: "لوله آبیاری چهار اینچ حرفه‌ای با مشخصات کامل",
        metaDescription:
            "مشخصات، کاربرد، قیمت و شرایط انتخاب لوله آبیاری چهار اینچ حرفه‌ای را بررسی کنید و بر اساس نیاز واقعی پروژه تصمیم بگیرید.",
        robotsIndex: true,
        robotsFollow: true,
        engineProfile: "k21",
    },
    ...overrides,
});

test.group("SEO analyzer", () => {
    test("scores a complete product highly", ({ assert }) => {
        const result = analyzeSeoEvidence(completeProduct(), "k21");
        assert.isAtLeast(result.total, 90);
        assert.notInclude(
            result.issues.map((item) => item.ruleCode),
            "product.category.missing",
        );
    });

    const cases: Array<[string, Partial<SeoEvidence>, string]> = [
        ["missing title", { title: null, profile: {} }, "meta.title.missing"],
        ["short title", { profile: { metaTitle: "کوتاه" } }, "meta.title.length"],
        [
            "missing description",
            { shortDescription: null, description: null, profile: { metaTitle: "عنوان استاندارد مناسب برای محصول آزمایشی" } },
            "meta.description.missing",
        ],
        ["missing slug", { slug: null }, "slug.missing"],
        ["invalid slug", { slug: "Bad Slug فارسی" }, "slug.invalid"],
        ["missing sku", { sku: null }, "product.sku.missing"],
        ["missing gtin in k21", { gtin: null }, "product.gtin.missing"],
        ["missing brand", { brandCount: 0 }, "product.brand.missing"],
        ["missing category", { categoryCount: 0 }, "product.category.missing"],
        ["missing image", { imageCount: 0, imageAltCount: 0 }, "media.image.missing"],
        ["missing alt", { imageCount: 2, imageAltCount: 1 }, "media.alt.missing"],
        ["missing price", { priceMinor: null }, "product.offer.incomplete"],
        ["orphan", { internalInboundCount: 0 }, "links.orphan"],
        ["published noindex", { profile: { ...completeProduct().profile, robotsIndex: false } }, "robots.noindex.published"],
    ];

    for (const [name, overrides, rule] of cases) {
        test(name, ({ assert }) =>
            assert.include(
                analyzeSeoEvidence(completeProduct(overrides), "k21").issues.map((item) => item.ruleCode),
                rule,
            ),
        );
    }

    test("does not require GTIN in k20", ({ assert }) => {
        assert.notInclude(
            analyzeSeoEvidence(completeProduct({ gtin: null }), "k20").issues.map((item) => item.ruleCode),
            "product.gtin.missing",
        );
    });

    test("scores component penalties independently", ({ assert }) => {
        const result = analyzeSeoEvidence(completeProduct({ imageCount: 2, imageAltCount: 0, categoryCount: 0 }), "k21");
        assert.isBelow(result.media, 100);
        assert.isBelow(result.commerce, 100);
        assert.equal(result.schema, 100);
    });
});

test.group("SEO builders", () => {
    test("builds robots with sitemap and OAI search bot", ({ assert }) => {
        const document = buildRobotsDocument({ ...DEFAULT_SEO_SETTINGS, base_url: "https://example.test" });
        assert.equal(document.rules[1]?.userAgent, "OAI-SearchBot");
        assert.deepEqual(document.sitemap, ["https://example.test/sitemap.xml"]);
        const text = serializeRobots(document);
        assert.include(text, "User-agent: OAI-SearchBot");
        assert.include(text, "Sitemap: https://example.test/sitemap.xml");
    });

    test("blocks all when robots is disabled", ({ assert }) => {
        const document = buildRobotsDocument({ ...DEFAULT_SEO_SETTINGS, robots_enabled: false });
        assert.deepEqual(document.rules, [{ userAgent: "*", disallow: ["/"] }]);
    });

    test("filters invalid and duplicate sitemap entries", ({ assert }) => {
        const entries = filterSitemapEntries([
            { url: "/relative" },
            { url: "https://example.test/a", lastModified: "2025-01-01" },
            {
                url: "https://example.test/a",
                lastModified: "2026-01-01",
                images: ["https://example.test/a.jpg", "https://example.test/a.jpg"],
            },
        ]);
        assert.lengthOf(entries, 1);
        assert.deepEqual(entries[0]?.images, ["https://example.test/a.jpg"]);
    });

    test("chunks at requested size", ({ assert }) => {
        const chunks = chunkSitemapEntries(
            Array.from({ length: 5 }, (_, index) => ({ url: `https://example.test/${index}` })),
            2,
        );
        assert.deepEqual(
            chunks.map((chunk) => chunk.length),
            [2, 2, 1],
        );
    });

    test("rejects invalid chunk sizes", ({ assert }) => {
        assert.throws(() => chunkSitemapEntries([], 0));
        assert.throws(() => chunkSitemapEntries([], 50_001));
    });

    test("builds product schema only from evidence", ({ assert }) => {
        const schema = buildEntitySchema(completeProduct(), { ...DEFAULT_SEO_SETTINGS, base_url: "https://example.test" });
        assert.equal(schema?.["@type"], "Product");
        assert.equal(schema?.sku, "PIPE-4-100");
        assert.property(schema ?? {}, "offers");
        assert.notProperty(schema ?? {}, "aggregateRating");
    });

    test("builds ProductGroup for variations", ({ assert }) => {
        const schema = buildEntitySchema(completeProduct({ variationCount: 3 }), DEFAULT_SEO_SETTINGS);
        assert.equal(schema?.["@type"], "ProductGroup");
    });

    test("returns null schema for noindex", ({ assert }) => {
        assert.isNull(buildEntitySchema(completeProduct({ profile: { robotsIndex: false } }), DEFAULT_SEO_SETTINGS));
    });

    test("builds organization only with real base and name", ({ assert }) => {
        assert.isNull(buildOrganizationSchema(DEFAULT_SEO_SETTINGS));
        const schema = buildOrganizationSchema({
            ...DEFAULT_SEO_SETTINGS,
            base_url: "https://example.test",
            organization_name: "Example",
        });
        assert.equal(schema?.name, "Example");
    });
});
