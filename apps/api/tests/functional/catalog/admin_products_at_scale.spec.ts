import testUtils from "@adonisjs/core/services/test_utils";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { createAdmin } from "./helpers.js";
import BulkDatasetSeeder, { FIXED_ADMINS } from "#database/seed_modules/0010_bulk_dataset_seeder";
import { runWithTenant } from "#services/tenant_context";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Scale-test coverage that runs against a real bulk-seeded dataset (≈1k products / 100 customers
 * / 50 orders) rather than the tiny fixture handful used by the other admin specs. Catches bugs
 * that only show up at realistic volumes (filter no-ops returning the global total, missing tag
 * links, etc.) — the kind of regression that motivated this whole filter fix.
 *
 * The group seeds the dataset once in `group.setup` and intentionally does NOT truncate between
 * tests; every test in this group is read-only. The bulk seeder targets are kept small (1,000
 * products) so the setup stays under ~3s on the dev container while still being orders of
 * magnitude bigger than the per-test fixtures elsewhere.
 */
test.group("Admin products list — bulk-seeded scale", (group) => {
    let admin: Awaited<ReturnType<typeof createAdmin>>;
    group.setup(async () => {
        /**
         * `testUtils.db().truncate()` returns a cleanup callback — calling it doesn't truncate,
         * the returned function does. We need a freshly empty DB *before* seeding, so invoke the
         * cleanup synchronously here, then seed on top.
         */
        const truncate = await testUtils.db().truncate();
        await truncate();
        /**
         * The bulk seeder is multi-tenant — its per-tenant numbering reads the active tenant context.
         * Run it inside the test tenant's context (transaction + GUC) so it seeds against `test` and
         * the committed rows are visible to the read-only HTTP assertions below.
         */
        await db.transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(TEST_TENANT_ID)]);
            await runWithTenant(BigInt(TEST_TENANT_ID), trx, async () => {
                const seeder = new BulkDatasetSeeder(trx);
                seeder.setOptions({ products: 1_000, users: 100, orders: 50, reset: false });
                await seeder.run();
            });
        });
        admin = await createAdmin();
    });

    test("baseline list returns the full seeded catalog", async ({ client, assert }) => {
        const response = await client.get("/api/v1/admin/products?limit=1").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1_000);
    });

    test("category filter narrows the list to a single leaf category", async ({ client, assert }) => {
        const smartphoneId = await leafCategoryId("bk-smartphones");
        const linkCount = await countLinks("product_category_links", "category_id", smartphoneId);
        const response = await client
            .get(`/api/v1/admin/products?limit=1&category=${smartphoneId}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(
            response.body().meta.total,
            linkCount,
            "category filter must match product_category_links rows for that category",
        );
        assert.isBelow(response.body().meta.total, 1_000, "filter must narrow below the global total");
        assert.isAbove(response.body().meta.total, 0, "smartphones leaf should have at least one product");
    });

    test("tag filter narrows the list to products linked to that tag", async ({ client, assert }) => {
        const tagId = await firstBulkTagId();
        const linkCount = await countLinks("product_tag_links", "tag_id", tagId);
        const response = await client.get(`/api/v1/admin/products?limit=1&tag=${tagId}`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, linkCount);
        assert.isBelow(response.body().meta.total, 1_000);
    });

    test("brand filter narrows the list to products linked to that brand", async ({ client, assert }) => {
        const brandId = await firstSeededBrandId();
        const linkCount = await countLinks("product_brand_links", "brand_id", brandId);
        const response = await client.get(`/api/v1/admin/products?limit=1&brand=${brandId}`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, linkCount);
    });

    test("admin roster matches the FIXED_ADMINS list exactly", async ({ assert }) => {
        const rows = (await db
            .from("users")
            .select("email")
            .where("role", "admin")
            .where("email", "like", "%@bulk.calibra.dev")) as Array<{ email: string }>;
        const seeded = rows.map((r) => r.email).sort();
        const expected = FIXED_ADMINS.map((a) => a.email).sort();
        assert.deepEqual(seeded, expected);
    });

    test("category tree carries the BULK_CATEGORY_TREE shape (8 roots, ≈56 leaves)", async ({ assert }) => {
        const rootsRow = (await db
            .from("product_categories")
            .whereNull("parent_id")
            .whereIn("id", (sub) =>
                sub
                    .select("category_id")
                    .from("product_category_translations")
                    .where("locale", "en")
                    .where("slug", "like", "bk-%"),
            )
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        assert.equal(Number(rootsRow?.count ?? 0), 8, "BULK_CATEGORY_TREE should produce 8 root departments");

        const leavesRow = (await db
            .from("product_categories")
            .whereIn("id", (sub) =>
                sub
                    .select("category_id")
                    .from("product_category_translations")
                    .where("locale", "en")
                    .where("slug", "like", "bk-%"),
            )
            .whereNotIn("id", (sub) => sub.select("parent_id").from("product_categories").whereNotNull("parent_id"))
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        assert.isAbove(Number(leavesRow?.count ?? 0), 40, "should have at least 40 leaf categories");
    });
});

async function leafCategoryId(slugEn: string): Promise<number> {
    const row = (await db
        .from("product_category_translations")
        .select("category_id")
        .where("locale", "en")
        .where("slug", slugEn)
        .first()) as { category_id: number | string } | undefined;
    if (!row) throw new Error(`Leaf category not found for slug ${slugEn}`);
    return Number(row.category_id);
}

async function firstBulkTagId(): Promise<number> {
    const row = (await db
        .from("product_tag_translations")
        .select("tag_id")
        .where("locale", "en")
        .where("slug", "like", "tag-%")
        .orderBy("tag_id", "asc")
        .first()) as { tag_id: number | string } | undefined;
    if (!row) throw new Error("No bulk tag found");
    return Number(row.tag_id);
}

async function firstSeededBrandId(): Promise<number> {
    const row = (await db.from("product_brands").select("id").orderBy("id", "asc").first()) as
        | { id: number | string }
        | undefined;
    if (!row) throw new Error("No seeded brand found");
    return Number(row.id);
}

async function countLinks(table: string, column: string, id: number): Promise<number> {
    const row = (await db.from(table).where(column, id).count("* as count").first()) as { count: string | number } | undefined;
    return Number(row?.count ?? 0);
}
