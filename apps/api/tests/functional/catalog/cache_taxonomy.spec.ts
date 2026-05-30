import cache from "@adonisjs/cache/services/main";
import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";

import { createBrand, createCategory, createTag } from "./helpers.js";
import ProductBrandTranslation from "#models/product_brand_translation";
import ProductCategoryTranslation from "#models/product_category_translation";
import ProductTagTranslation from "#models/product_tag_translation";
import { CacheTags } from "#services/cache_keys";

test.group("Catalog taxonomy caching", (group) => {
    group.each.setup(async () => {
        /**
         * Mirror the self-cleaning truncate in {@link cache_products.spec.ts}: the strict
         * `data.length === 1` assertion would fail if the previous spec in this Japa process
         * (which under sharding can be any non-truncating helper like {@link resetWithFoundation})
         * left rows behind. Run truncate at setup as well as teardown so this group's first
         * test is self-contained.
         */
        const truncate = await testUtils.db().truncate();
        await truncate();
        return truncate;
    });

    test("categories tree — cached, then refreshed when taxonomy tag invalidated", async ({ client, assert }) => {
        const category = await createCategory({
            fa: { name: "ریشه", slug: "root-fa" },
            en: { name: "Root", slug: "root-en" },
        });

        const first = await client.get("/api/v1/categories?tree=1").header("Accept-Language", "en");
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data.length, 1);
        assert.equal(first.body().data[0].name, "Root");

        await ProductCategoryTranslation.query()
            .where("category_id", String(category.id))
            .where("locale", "en")
            .update({ name: "RenamedRoot" });

        const warm = await client.get("/api/v1/categories?tree=1").header("Accept-Language", "en");
        assert.equal(warm.body().data[0].name, "Root", "tree should be cached");

        await cache.deleteByTag({ tags: [CacheTags.catalogTaxonomy] });

        const refreshed = await client.get("/api/v1/categories?tree=1").header("Accept-Language", "en");
        assert.equal(refreshed.body().data[0].name, "RenamedRoot");
    });

    test("tags list — cached, invalidated by taxonomy tag", async ({ client, assert }) => {
        const tag = await createTag({ fa: { name: "تگ", slug: "tag-fa" }, en: { name: "TagOne", slug: "tag-en" } });

        const first = await client.get("/api/v1/tags").header("Accept-Language", "en");
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data[0].name, "TagOne");

        await ProductTagTranslation.query().where("tag_id", String(tag.id)).where("locale", "en").update({ name: "MutatedTag" });

        const warm = await client.get("/api/v1/tags").header("Accept-Language", "en");
        assert.equal(warm.body().data[0].name, "TagOne");

        await cache.deleteByTag({ tags: [CacheTags.catalogTaxonomy] });

        const refreshed = await client.get("/api/v1/tags").header("Accept-Language", "en");
        assert.equal(refreshed.body().data[0].name, "MutatedTag");
    });

    test("brands list — cached, invalidated by taxonomy tag", async ({ client, assert }) => {
        const brand = await createBrand({
            fa: { name: "برند", slug: "brand-fa" },
            en: { name: "BrandOne", slug: "brand-en" },
        });

        const first = await client.get("/api/v1/brands").header("Accept-Language", "en");
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().data[0].name, "BrandOne");

        await ProductBrandTranslation.query()
            .where("brand_id", String(brand.id))
            .where("locale", "en")
            .update({ name: "MutatedBrand" });

        const warm = await client.get("/api/v1/brands").header("Accept-Language", "en");
        assert.equal(warm.body().data[0].name, "BrandOne");

        await cache.deleteByTag({ tags: [CacheTags.catalogTaxonomy] });

        const refreshed = await client.get("/api/v1/brands").header("Accept-Language", "en");
        assert.equal(refreshed.body().data[0].name, "MutatedBrand");
    });
});
