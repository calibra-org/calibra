import { test } from "@japa/runner";

import { createCategory } from "./helpers.js";
import { truncateAndCleanup } from "#tests/helpers/truncate";

test.group("GET /api/v1/categories", (group) => {
    group.each.setup(async () => truncateAndCleanup());

    test("tree=1 returns nested children", async ({ client, assert }) => {
        const root = await createCategory({ fa: { name: "ریشه", slug: "root-fa" }, en: { name: "Root", slug: "root-en" } });
        await createCategory({
            fa: { name: "فرزند", slug: "child-fa" },
            en: { name: "Child", slug: "child-en" },
            parentId: root.id,
        });
        const response = await client.get("/api/v1/categories?tree=1").header("Accept-Language", "en");
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const data = response.body().data as Array<{ name: string; children: Array<{ name: string }> }>;
        const rootRow = data.find((row) => row.name === "Root");
        assert.isNotNull(rootRow);
        assert.equal(rootRow?.children.length, 1);
        assert.equal(rootRow?.children[0]?.name, "Child");
    });

    test("parent_id=null returns only root-level categories", async ({ client, assert }) => {
        const root = await createCategory({ fa: { name: "ریشه ۲", slug: "root2-fa" }, en: { name: "Root2", slug: "root2-en" } });
        await createCategory({
            fa: { name: "فرزند ۲", slug: "child2-fa" },
            en: { name: "Child2", slug: "child2-en" },
            parentId: root.id,
        });
        const response = await client.get("/api/v1/categories?parent_id=null").header("Accept-Language", "en");
        const names = response.body().data.map((c: { name: string }) => c.name);
        assert.include(names, "Root2");
        assert.notInclude(names, "Child2");
    });

    test("returns translated names per locale", async ({ client, assert }) => {
        await createCategory({ fa: { name: "پوشاک", slug: "apparel-fa" }, en: { name: "Apparel", slug: "apparel-en" } });
        const fa = await client.get("/api/v1/categories").header("Accept-Language", "fa");
        const en = await client.get("/api/v1/categories").header("Accept-Language", "en");
        const faNames = fa.body().data.map((c: { name: string }) => c.name);
        const enNames = en.body().data.map((c: { name: string }) => c.name);
        assert.include(faNames, "پوشاک");
        assert.include(enNames, "Apparel");
    });
});
