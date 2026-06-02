import testUtils from "@adonisjs/core/services/test_utils";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Region from "#models/region";
import RegionTranslation from "#models/region_translation";

/**
 * `MainSeeder` (run by `db:seed`) is multi-tenant: it seeds the GLOBAL reference data once (the
 * ISO-3166-2:IR provinces) and then provisions three demo tenants (aurora / mehr / kasra), each with
 * its own per-tenant defaults via {@link TenantProvisioningService} — a `standard` tax class + VAT
 * rate, a fallback shipping zone + flat-rate method, a cash-on-delivery gateway, the core settings,
 * and a small demo catalog/customers/orders.
 *
 * These specs assert that new reality. `tenants` is fully reset in setup (CASCADE) so the idempotent
 * `MainSeeder` re-provisions from scratch rather than skipping already-present demo tenants. The
 * suite runs as the superuser, so per-tenant tables are queried with an explicit `tenant_id` filter
 * (RLS isolation itself is proven in `rls_isolation.spec.ts`).
 */
const DEMO_SLUGS = ["aurora", "mehr", "kasra"] as const;

test.group("Demo + foundation seeder", (group) => {
    group.each.setup(async () => {
        const cleanup = await testUtils.db().truncate();
        await db.rawQuery('TRUNCATE TABLE "tenants" RESTART IDENTITY CASCADE');
        await testUtils.db().seed();
        return cleanup;
    });

    async function demoTenantIds(): Promise<Map<string, number>> {
        const rows = await db
            .from("tenants")
            .whereIn("slug", [...DEMO_SLUGS])
            .select("id", "slug");
        return new Map(rows.map((row) => [String(row.slug), Number(row.id)]));
    }

    test("provisions the three demo tenants", async ({ assert }) => {
        const bySlug = await demoTenantIds();
        for (const slug of DEMO_SLUGS) {
            assert.isTrue(bySlug.has(slug), `demo tenant ${slug} should be provisioned`);
        }
        assert.isAtLeast(bySlug.size, 3);
    });

    test("seeds 31 Iran provinces globally, each with fa and en translations", async ({ assert }) => {
        const iranProvinces = await Region.query().where("country_code", "IR").whereNull("parent_id");
        assert.equal(iranProvinces.length, 31);

        for (const province of iranProvinces) {
            const translations = await RegionTranslation.query().where("region_id", String(province.id));
            const locales = translations.map((row) => row.locale).sort();
            assert.deepEqual(locales, ["en", "fa"], `province ${province.code} missing fa/en translations`);
        }
    });

    test("provisions a 'standard' tax class with a 9% VAT rate for every tenant", async ({ assert }) => {
        const bySlug = await demoTenantIds();
        for (const [slug, tenantId] of bySlug) {
            const taxClass = await db.from("tax_classes").where("tenant_id", tenantId).where("slug", "standard").first();
            assert.isNotNull(taxClass, `tenant ${slug} missing standard tax class`);
            const rate = await db.from("tax_rates").where("tenant_id", tenantId).where("tax_class_id", taxClass.id).first();
            assert.isNotNull(rate, `tenant ${slug} missing VAT rate`);
            assert.equal(Number.parseFloat(String(rate.rate)), 9);
        }
    });

    test("provisions exactly one fallback shipping zone per tenant", async ({ assert }) => {
        const bySlug = await demoTenantIds();
        for (const [slug, tenantId] of bySlug) {
            const fallback = (await db
                .from("shipping_zones")
                .where("tenant_id", tenantId)
                .where("is_fallback", true)
                .count("* as count")) as Array<{ count: string | number }>;
            assert.equal(Number(fallback[0]?.count), 1, `tenant ${slug} should have one fallback zone`);
        }
    });

    test("provisions a cash-on-delivery gateway per tenant", async ({ assert }) => {
        const bySlug = await demoTenantIds();
        for (const [slug, tenantId] of bySlug) {
            const cod = await db.from("payment_gateways").where("tenant_id", tenantId).where("code", "cod").first();
            assert.isNotNull(cod, `tenant ${slug} missing cod gateway`);
            assert.isTrue(Boolean(cod.enabled));
        }
    });

    test("provisions the core settings per tenant", async ({ assert }) => {
        const bySlug = await demoTenantIds();
        for (const [slug, tenantId] of bySlug) {
            for (const key of ["shop_name", "primary_locale"]) {
                const row = await db
                    .from("settings")
                    .where("tenant_id", tenantId)
                    .where("group_key", "general")
                    .where("key", key)
                    .first();
                assert.isNotNull(row, `tenant ${slug} missing setting general.${key}`);
            }
        }
    });

    test("order numbering restarts per tenant (each shop's first order is #1000)", async ({ assert }) => {
        const bySlug = await demoTenantIds();
        for (const [slug, tenantId] of bySlug) {
            const first = (await db
                .from("orders")
                .where("tenant_id", tenantId)
                .min("order_number as min")) as Array<{ min: string | number | null }>;
            if (first[0]?.min !== null && first[0]?.min !== undefined) {
                assert.equal(Number(first[0].min), 1000, `tenant ${slug} should start order numbering at 1000`);
            }
        }
    });

    test("re-running the seeder does not duplicate tenants", async ({ assert }) => {
        const countDemo = async (): Promise<number> => {
            const rows = (await db
                .from("tenants")
                .whereIn("slug", [...DEMO_SLUGS])
                .count("* as count")) as Array<{ count: string | number }>;
            return Number(rows[0]?.count ?? 0);
        };
        const before = await countDemo();
        await testUtils.db().seed();
        const after = await countDemo();
        assert.equal(after, before);
        assert.equal(after, 3);
    });

    test("regions table is country-scoped — inserting a US row succeeds without a migration", async ({ assert }) => {
        const beforeRows = (await db.from("regions").count("* as count")) as Array<{ count: string | number }>;
        const before = Number(beforeRows[0]?.count ?? 0);

        const usRegion = await Region.create({
            countryCode: "US",
            code: "US-CA",
            ordering: 1,
            attributes: {},
        });

        assert.equal(usRegion.countryCode, "US");
        assert.equal(usRegion.code, "US-CA");

        const afterRows = (await db.from("regions").count("* as count")) as Array<{ count: string | number }>;
        assert.equal(Number(afterRows[0]?.count), before + 1);
    });
});
