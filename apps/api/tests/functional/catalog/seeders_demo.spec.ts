import testUtils from "@adonisjs/core/services/test_utils";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

/**
 * The multi-tenant demo seed (`MainSeeder`) gives each demo tenant its own small catalog rather than
 * one large shared one — "one big, two small" — to exercise per-tenant isolation and the
 * noisy-neighbour story. These specs assert each tenant's catalog independently (filtered by
 * `tenant_id`; the suite runs as the superuser) and that catalogs never bleed across tenants.
 *
 * Expected per-tenant product counts mirror `DEMO_TENANTS` in `database/seeders/main_seeder.ts`.
 */
const EXPECTED_PRODUCTS: ReadonlyArray<{ slug: string; products: number }> = [
    { slug: "aurora", products: 25 },
    { slug: "mehr", products: 6 },
    { slug: "kasra", products: 5 },
];

test.group("Demo seeder (per-tenant catalog)", (group) => {
    group.each.setup(async () => {
        const cleanup = await testUtils.db().truncate();
        await db.rawQuery('TRUNCATE TABLE "tenants" RESTART IDENTITY CASCADE');
        await testUtils.db().seed();
        return cleanup;
    });

    async function tenantId(slug: string): Promise<number> {
        const row = await db.from("tenants").where("slug", slug).select("id").firstOrFail();
        return Number(row.id);
    }

    async function countProducts(tid: number): Promise<number> {
        const rows = (await db.from("products").where("tenant_id", tid).count("* as count")) as Array<{
            count: string | number;
        }>;
        return Number(rows[0]?.count ?? 0);
    }

    test("each demo tenant gets its own catalog at the expected volume", async ({ assert }) => {
        for (const { slug, products } of EXPECTED_PRODUCTS) {
            const tid = await tenantId(slug);
            assert.equal(await countProducts(tid), products, `tenant ${slug} product count`);
        }
    });

    test("every seeded product carries a fa translation", async ({ assert }) => {
        const orphans = (await db.rawQuery(`
            SELECT p.id
            FROM products p
            LEFT JOIN product_translations t
              ON t.product_id = p.id AND t.tenant_id = p.tenant_id AND t.locale = 'fa'
            WHERE t.product_id IS NULL
        `)) as { rows: unknown[] };
        assert.equal(orphans.rows.length, 0, "every product must have a fa translation");
    });

    test("catalogs are partitioned by tenant — totals equal the per-tenant sum", async ({ assert }) => {
        let perTenantSum = 0;
        for (const { slug } of EXPECTED_PRODUCTS) {
            perTenantSum += await countProducts(await tenantId(slug));
        }
        const totalRows = (await db.from("products").count("* as count")) as Array<{ count: string | number }>;
        assert.equal(Number(totalRows[0]?.count), perTenantSum);
        assert.equal(perTenantSum, 36);
    });

    test("re-running the seeder does not duplicate a tenant's catalog", async ({ assert }) => {
        const aurora = await tenantId("aurora");
        const before = await countProducts(aurora);
        await testUtils.db().seed();
        const after = await countProducts(aurora);
        assert.equal(after, before);
    });
});
