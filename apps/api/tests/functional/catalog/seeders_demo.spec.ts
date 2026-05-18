import testUtils from "@adonisjs/core/services/test_utils";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Product from "#models/product";

test.group("Demo seeder", (group) => {
    group.each.setup(async () => {
        const cleanup = await testUtils.db().truncate();
        await testUtils.db().seed();
        return cleanup;
    });

    test("seeds at least 50 products", async ({ assert }) => {
        const count = await Product.query().count("* as count");
        assert.isAtLeast(Number(count[0]?.$extras.count), 50);
    });

    test("seeds 8 demo categories", async ({ assert }) => {
        const cats = await db.from("product_categories").count("* as count");
        assert.isAtLeast(Number(cats[0]?.count), 8);
    });

    test("every product has at least one image", async ({ assert }) => {
        const rows = (await db.rawQuery(`
            SELECT p.id
            FROM products p
            LEFT JOIN product_images i ON i.product_id = p.id
            WHERE i.id IS NULL
        `)) as { rows: unknown[] };
        assert.equal(rows.rows.length, 0, "every product must have at least one image");
    });

    test("variable products have at least 2 variations each", async ({ assert }) => {
        const rows = (await db.rawQuery(`
            SELECT p.id, COUNT(v.id) as variation_count
            FROM products p
            LEFT JOIN product_variations v ON v.product_id = p.id
            WHERE p.type = 'variable'
            GROUP BY p.id
            HAVING COUNT(v.id) < 2
        `)) as { rows: unknown[] };
        assert.equal(rows.rows.length, 0, "every variable product must have ≥2 variations");
    });

    test("re-running the seeder does not duplicate rows", async ({ assert }) => {
        const before = await Product.query().count("* as count");
        await testUtils.db().seed();
        const after = await Product.query().count("* as count");
        assert.equal(Number(before[0]?.$extras.count), Number(after[0]?.$extras.count));
    });

    test("never produces a pa_ prefix on any attribute code or term slug", async ({ assert }) => {
        const attrs = await db.from("product_attributes").select("code");
        for (const row of attrs) {
            assert.notMatch(String(row.code), /^pa_/);
        }
        const terms = await db.from("product_attribute_term_translations").select("slug");
        for (const row of terms) {
            assert.notMatch(String(row.slug), /^pa_/);
        }
    });
});
