import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import { bootstrapRoles } from "#services/db_roles";
import { maybeTenantId } from "#services/tenant_context";
import { runInTestTenant, TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Proves the queue-job tenant-context wrapper {@link withJobTenantContext}: on a context-less worker
 * it discovers the owning row's `tenant_id` (on `postgres_admin`) and runs the body inside that
 * tenant's `runWithTenant` scope; when already inside a context (inline/sync dispatch) it rides the
 * caller's context rather than re-discovering. `media` stands in for the owning row — the wrapper is
 * table-agnostic, and `media` seeds without the FK chain `product_imports` carries.
 */
const TENANT_A = 900_021;
const TENANT_B = 900_022;

async function seedTenant(su: ReturnType<typeof db.connection>, id: number, slug: string, now: string): Promise<void> {
    const plan = await su.from("plans").where("key", "starter").firstOrFail();
    await su
        .table("tenants")
        .insert({
            id,
            slug,
            name: slug,
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

async function seedMedia(su: ReturnType<typeof db.connection>, tenantId: number, now: string): Promise<number> {
    const rows = (await su
        .table("media")
        .insert({
            tenant_id: tenantId,
            kind: "file",
            url: `http://localhost/uploads/t${tenantId}/owning.bin`,
            filename: "owning.bin",
            attributes: JSON.stringify({}),
            created_at: now,
            updated_at: now,
        })
        .returning("id")) as Array<{ id: number | string }>;
    return Number(rows[0].id);
}

test.group("withJobTenantContext", (group) => {
    let mediaA = 0;
    let mediaB = 0;

    group.setup(async () => {
        const su = db.connection();
        await bootstrapRoles(su, {
            appUser: "calibra_app",
            appPassword: "calibra_app",
            adminUser: "calibra_admin",
            adminPassword: "calibra_admin",
        });
        const now = DateTime.utc().toSQL()!;
        await su
            .table("plans")
            .insert({ key: "starter", name: "Starter", db_tier: "shared", is_default: true, created_at: now, updated_at: now })
            .onConflict("key")
            .ignore();
        await seedTenant(su, TENANT_A, "job-a", now);
        await seedTenant(su, TENANT_B, "job-b", now);
        mediaA = await seedMedia(su, TENANT_A, now);
        mediaB = await seedMedia(su, TENANT_B, now);

        return async () => {
            await su.from("media").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await su.from("tenants").whereIn("id", [TENANT_A, TENANT_B]).delete();
        };
    });

    test("context-less worker discovers the owning row's tenant and scopes the body", async ({ assert }) => {
        let seenA: bigint | null = null;
        await withJobTenantContext("media", mediaA, async () => {
            seenA = maybeTenantId();
        });
        assert.equal(seenA, BigInt(TENANT_A));

        let seenB: bigint | null = null;
        await withJobTenantContext("media", mediaB, async () => {
            seenB = maybeTenantId();
        });
        assert.equal(seenB, BigInt(TENANT_B));
    });

    test("inline dispatch rides the caller's context instead of re-discovering", async ({ assert }) => {
        let seen: bigint | null = null;
        await runInTestTenant(async () => {
            /** The owning row belongs to tenant A, but the ambient context is the test tenant. */
            await withJobTenantContext("media", mediaA, async () => {
                seen = maybeTenantId();
            });
        });
        assert.equal(seen, BigInt(TEST_TENANT_ID));
    });

    test("a missing owning row still runs the body (unscoped) so the runner can abort cleanly", async ({ assert }) => {
        let ran = false;
        let seen: bigint | null = BigInt(-1);
        await withJobTenantContext("media", 99_999_999, async () => {
            ran = true;
            seen = maybeTenantId();
        });
        assert.isTrue(ran);
        assert.isNull(seen);
    });
});
