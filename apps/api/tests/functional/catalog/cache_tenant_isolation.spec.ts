import cache from "@adonisjs/cache/services/main";
import testUtils from "@adonisjs/core/services/test_utils";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { createCategory } from "./helpers.js";
import ProductCategoryTranslation from "#models/product_category_translation";
import { TEST_TENANT_SLUG } from "#tests/helpers/tenant";

/** A reserved id distinct from every other spec's second tenant (e.g. otp.spec uses 100_001). */
const SECOND_TENANT_ID = 100_077;
const SECOND_TENANT_SLUG = "cache-tenant-b";

/**
 * A second active tenant so cache-key namespacing can be exercised over HTTP.
 *
 * The functional suite connects as the superuser (RLS bypassed), so this spec deliberately does
 * NOT assert data isolation — that is proven against the `calibra_app` runtime role in
 * `foundation/rls_isolation.spec.ts`. What it proves is the orthogonal Phase-2 guarantee: a cache
 * entry warmed under tenant A's namespaced key is never served to a request carrying tenant B's
 * header. Tenant B cold-misses on its own key and re-runs the factory, so it observes a mutation
 * that tenant A (still served from its warm entry) does not.
 */
async function ensureSecondTenant(): Promise<void> {
    const admin = db.connection("postgres_admin");
    const now = DateTime.utc().toSQL()!;
    const plan = await admin.from("plans").where("key", "starter").firstOrFail();
    await admin
        .table("tenants")
        .insert({
            id: SECOND_TENANT_ID,
            slug: SECOND_TENANT_SLUG,
            name: "Cache Tenant B",
            status: "active",
            plan_id: Number(plan.id),
            db_tier: "shared",
            template_key: "default",
            currency_code: "IRR",
            primary_locale: "fa",
            created_at: now,
            updated_at: now,
        })
        .onConflict("id")
        .ignore();
}

test.group("Catalog cache — cross-tenant key namespacing", (group) => {
    group.each.setup(async () => {
        await ensureSecondTenant();
        const truncate = await testUtils.db().truncate();
        await truncate();
        await ensureSecondTenant();
        return truncate;
    });

    test("a request as tenant B never receives tenant A's warmed cache entry", async ({ client, assert }) => {
        const category = await createCategory({
            fa: { name: "ریشه", slug: "root-fa" },
            en: { name: "Root", slug: "root-en" },
        });

        /** Warm tenant A's categories-tree entry (default header → TEST_TENANT_SLUG). */
        const warmA = await client.get("/api/v1/categories?tree=1").header("Accept-Language", "en");
        warmA.assertStatus(200);
        assert.equal(warmA.body().data[0].name, "Root");

        /** Mutate the shared row WITHOUT invalidating any cache tag. */
        await ProductCategoryTranslation.query()
            .where("category_id", String(category.id))
            .where("locale", "en")
            .update({ name: "RenamedRoot" });

        /** Tenant A is still served from its warm entry — must see the stale name. */
        const stillWarmA = await client
            .get("/api/v1/categories?tree=1")
            .header("Accept-Language", "en")
            .header("X-Calibra-Tenant", TEST_TENANT_SLUG);
        assert.equal(stillWarmA.body().data[0].name, "Root", "tenant A must still hit its warm cache entry");

        /** Tenant B carries a different key → cold miss → re-runs the factory → sees the fresh name. */
        const coldB = await client
            .get("/api/v1/categories?tree=1")
            .header("Accept-Language", "en")
            .header("X-Calibra-Tenant", SECOND_TENANT_SLUG);
        coldB.assertStatus(200);
        assert.equal(
            coldB.body().data[0].name,
            "RenamedRoot",
            "tenant B must cold-miss on its own namespaced key, not read tenant A's warmed bytes",
        );
    });

    group.teardown(async () => {
        await cache.clear();
        await db.connection("postgres_admin").from("tenants").where("id", SECOND_TENANT_ID).delete();
    });
});
