import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { bootstrapRoles } from "#services/db_roles";
import env from "#start/env";

/**
 * Database-level proof of tenant isolation, run against the runtime role `calibra_app`
 * (NOBYPASSRLS) — NOT the suite superuser. The rest of the suite runs as the superuser (which
 * bypasses RLS), so this is the one spec that exercises the real production posture: fail-closed
 * reads, per-tenant visibility, and the `WITH CHECK` write guard.
 *
 * Self-bootstrapping: `bootstrapRoles` (the same service `db:bootstrap-roles` uses) ensures the two
 * roles + their grants exist, so the spec passes both on the spin (roles already present) and in CI
 * (where the suite otherwise runs as a single superuser). It is idempotent and uses the canonical
 * passwords, so re-asserting them does not disturb a running stack.
 */
const APP_CONNECTION = "rls_isolation_app";
const APP_USER = "calibra_app";
const APP_PASSWORD = "calibra_app";
const ADMIN_USER = "calibra_admin";
const ADMIN_PASSWORD = "calibra_admin";
const TENANT_A = 900_001;
const TENANT_B = 900_002;

/** Global / control-plane tables that must carry NEITHER RLS nor a `tenant_id` column. */
const GLOBAL_TABLES = ["tenants", "plans", "regions", "currencies"];

/**
 * Control-plane tables that reference a tenant but are NOT tenant-scoped *data* — they are platform
 * metadata ABOUT tenants, read by the global control plane with an explicit `tenant_id`, so they are
 * intentionally excluded from the RLS sweep (see migration `1750002000000`).
 */
const CONTROL_PLANE_WITH_TENANT_ID = ["tenant_domains", "tenant_usage_daily", "tenant_impersonation_events"];

test.group("RLS tenant isolation (calibra_app)", (group) => {
    group.setup(async () => {
        const su = db.connection();
        await bootstrapRoles(su, {
            appUser: APP_USER,
            appPassword: APP_PASSWORD,
            adminUser: ADMIN_USER,
            adminPassword: ADMIN_PASSWORD,
        });

        const now = DateTime.utc().toSQL()!;
        await su.table("currencies").insert({ code: "IRR", symbol: "rial", name_en: "Rial", name_fa: "ریال", base_ratio: 1, enabled: true, created_at: now, updated_at: now }).onConflict("code").ignore();
        await su.table("plans").insert({ key: "starter", name: "Starter", db_tier: "shared", is_default: true, created_at: now, updated_at: now }).onConflict("key").ignore();
        const plan = await su.from("plans").where("key", "starter").firstOrFail();

        for (const [id, slug] of [[TENANT_A, "rls-a"], [TENANT_B, "rls-b"]] as const) {
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

        /** Seed asymmetric per-tenant settings so a count alone distinguishes the two tenants. */
        await su.from("settings").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
        const settingRows = [
            { tenant_id: TENANT_A, group_key: "general", key: "shop_name", value: JSON.stringify("A"), type: "string", created_at: now, updated_at: now },
            { tenant_id: TENANT_A, group_key: "general", key: "primary_locale", value: JSON.stringify("fa"), type: "string", created_at: now, updated_at: now },
            { tenant_id: TENANT_B, group_key: "general", key: "shop_name", value: JSON.stringify("B"), type: "string", created_at: now, updated_at: now },
        ];
        await su.table("settings").insert(settingRows);

        db.manager.add(APP_CONNECTION, {
            client: "pg",
            connection: {
                host: env.get("DB_HOST"),
                port: env.get("DB_PORT"),
                user: APP_USER,
                password: APP_PASSWORD,
                database: env.get("DB_DATABASE"),
            },
        });

        return async () => {
            await db.manager.close(APP_CONNECTION, true);
            await db.connection().from("tenants").whereIn("id", [TENANT_A, TENANT_B]).delete();
        };
    });

    test("fail-closed: calibra_app with no app.current_tenant sees zero rows", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);
        const result = await app.rawQuery("SELECT count(*)::int AS count FROM settings");
        assert.equal(result.rows[0].count, 0);
    });

    test("calibra_app sees only the tenant set in app.current_tenant", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);

        const countFor = async (tenantId: number): Promise<number> =>
            app.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
                const res = await trx.rawQuery("SELECT count(*)::int AS count FROM settings");
                return res.rows[0].count as number;
            });

        assert.equal(await countFor(TENANT_A), 2);
        assert.equal(await countFor(TENANT_B), 1);
    });

    test("WITH CHECK rejects an INSERT whose tenant_id differs from app.current_tenant", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);
        const now = DateTime.utc().toSQL()!;
        let rejected = false;
        try {
            await app.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(TENANT_A)]);
                await trx
                    .table("settings")
                    .insert({ tenant_id: TENANT_B, group_key: "general", key: "leak", value: JSON.stringify("x"), type: "string", created_at: now, updated_at: now });
            });
        } catch {
            rejected = true;
        }
        assert.isTrue(rejected, "INSERT with a mismatched tenant_id must be rejected by the WITH CHECK policy");
    });

    test("calibra_app is NOBYPASSRLS; calibra_admin is BYPASSRLS", async ({ assert }) => {
        const su = db.connection();
        const rows = (await su.rawQuery("SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN (?, ?)", [APP_USER, ADMIN_USER])).rows as Array<{
            rolname: string;
            rolbypassrls: boolean;
        }>;
        const byName = new Map(rows.map((r) => [r.rolname, r.rolbypassrls]));
        assert.isFalse(byName.get(APP_USER), "calibra_app must NOT bypass RLS");
        assert.isTrue(byName.get(ADMIN_USER), "calibra_admin must bypass RLS");
    });

    test("every per-tenant table FORCEs row level security", async ({ assert }) => {
        const su = db.connection();
        const rows = (
            await su.rawQuery(`
                SELECT c.relname, c.relforcerowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relkind = 'r'
                  AND EXISTS (
                      SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id'
                  )
            `)
        ).rows as Array<{ relname: string; relforcerowsecurity: boolean }>;

        const scoped = rows.filter((r) => !CONTROL_PLANE_WITH_TENANT_ID.includes(r.relname));
        assert.isAbove(scoped.length, 0, "expected at least one tenant-scoped table");
        const unforced = scoped.filter((r) => !r.relforcerowsecurity).map((r) => r.relname);
        assert.deepEqual(unforced, [], `tables with tenant_id but no FORCE RLS: ${unforced.join(", ")}`);
    });

    test("global tables carry neither RLS nor a tenant_id column", async ({ assert }) => {
        const su = db.connection();
        for (const table of GLOBAL_TABLES) {
            const rls = (await su.rawQuery("SELECT relrowsecurity FROM pg_class WHERE relname = ?", [table])).rows[0] as
                | { relrowsecurity: boolean }
                | undefined;
            assert.isFalse(rls?.relrowsecurity, `${table} should not have RLS enabled`);

            const col = (
                await su.rawQuery(
                    "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name = ? AND column_name = 'tenant_id'",
                    [table],
                )
            ).rows;
            assert.lengthOf(col, 0, `${table} should not have a tenant_id column`);
        }
    });
});
