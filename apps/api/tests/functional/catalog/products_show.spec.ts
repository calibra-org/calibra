import testUtils from "@adonisjs/core/services/test_utils";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { createProduct } from "./helpers.js";

test.group("GET /api/v1/products/:slug", (group) => {
    group.each.setup(async () => testUtils.db().truncate());

    test("resolves a single product by its localized fa slug", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "گوشی سامسونگ", slug: "گوشی-سامسونگ-show" },
            en: { name: "Samsung Phone", slug: "samsung-phone-show" },
        });
        const response = await client.get("/api/v1/products/گوشی-سامسونگ-show").header("Accept-Language", "fa");
        response.assertStatus(200);
        assert.equal(response.body().data.name, "گوشی سامسونگ");
        assert.equal(response.body().data.slug, "گوشی-سامسونگ-show");
    });

    test("resolves the same product by its en slug under Accept-Language: en", async ({ client, assert }) => {
        await createProduct({
            fa: { name: "گوشی شو", slug: "guo-shi-show" },
            en: { name: "Show Phone", slug: "show-phone" },
        });
        const response = await client.get("/api/v1/products/show-phone").header("Accept-Language", "en");
        response.assertStatus(200);
        assert.equal(response.body().data.name, "Show Phone");
    });

    test("returns 404 when the slug is requested under the wrong locale", async ({ client }) => {
        await createProduct({
            fa: { name: "فقط فا", slug: "faqat-fa" },
            en: { name: "Only En", slug: "only-en" },
        });
        const response = await client.get("/api/v1/products/faqat-fa").header("Accept-Language", "en");
        response.assertStatus(404);
    });

    test("returns 404 for a soft-deleted product", async ({ client }) => {
        const p = await createProduct({ fa: { name: "حذف شده", slug: "deleted" }, en: { name: "Deleted", slug: "deleted-en" } });
        p.deletedAt = DateTime.utc();
        await p.save();
        const response = await client.get("/api/v1/products/deleted-en").header("Accept-Language", "en");
        response.assertStatus(404);
    });
});
