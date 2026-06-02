import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import { runWithTenant } from "#services/tenant_context";
import env from "#start/env";

/**
 * Shared default tenant for the test suite. Factories stamp every per-tenant row with this tenant's
 * id, and the api-client sends `X-Calibra-Tenant: test` on every request (see `tests/bootstrap.ts`)
 * so tenant-context-dependent code resolves to it.
 *
 * The id is a FIXED reserved value (well above the auto-increment range the seeders use) so it stays
 * valid across `testUtils.db().truncate()` + reseed cycles that some seeder-behaviour specs run:
 * those wipe + re-seed the demo tenants (low ids), but {@link ensureTestTenant} re-inserts the test
 * tenant at the same reserved id before every test, keeping the database-level `app.current_tenant`
 * GUC default (set once in {@link seedTestTenant}) pointing at a row that always exists.
 */
export const TEST_TENANT_SLUG = "test";
export const TEST_TENANT_ID = 100000;

/** Idempotently (re)create the reserved currency, plan, and test tenant. Cheap enough to run per-test. */
export async function ensureTestTenant(): Promise<number> {
    const conn = db.connection("postgres_admin");
    const now = DateTime.utc().toSQL()!;

    await conn
        .table("currencies")
        .insert({
            code: "IRR",
            symbol: "rial",
            name_en: "Rial",
            name_fa: "ریال",
            base_ratio: 1,
            enabled: true,
            created_at: now,
            updated_at: now,
        })
        .onConflict("code")
        .ignore();

    await conn
        .table("plans")
        .insert({ key: "starter", name: "Starter", db_tier: "shared", is_default: true, created_at: now, updated_at: now })
        .onConflict("key")
        .ignore();

    const plan = await conn.from("plans").where("key", "starter").first();

    await conn
        .table("tenants")
        .insert({
            id: TEST_TENANT_ID,
            slug: TEST_TENANT_SLUG,
            name: "Test Shop",
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

    return TEST_TENANT_ID;
}

/**
 * One-time runner setup: ensure the test tenant exists and pin it as the database-level
 * `app.current_tenant` default so every pooled connection resolves it. Combined with the `tenant_id`
 * column default, raw `db.table().insert()` callers (seeders, controllers that bypass the model hook)
 * auto-fill `tenant_id` without a request context. RLS itself is bypassed by the test superuser —
 * this only feeds the column default. The GUC value never changes because the id is fixed.
 */
export async function seedTestTenant(): Promise<number> {
    await ensureTestTenant();
    const database = env.get("DB_DATABASE").replaceAll('"', '""');
    const role = env.get("DB_USER").replaceAll('"', '""');
    /**
     * Pin the GUC default on the runtime ROLE (the test superuser) rather than the database, so the
     * `tenant_id` column default fills for factory inserts WITHOUT leaking onto the dedicated
     * `calibra_app` connection the RLS isolation spec opens — that connection must see a genuinely
     * unset `app.current_tenant` to prove fail-closed behaviour. Resetting the old database-level
     * default keeps a previously-bootstrapped DB from carrying both. Requires superuser/owner.
     */
    const conn = db.connection();
    await conn.rawQuery(`ALTER DATABASE "${database}" RESET app.current_tenant`);
    await conn.rawQuery(`ALTER ROLE "${role}" IN DATABASE "${database}" SET app.current_tenant = '${TEST_TENANT_ID}'`);
    return TEST_TENANT_ID;
}

/** The default test tenant id — a fixed constant, no DB round-trip. */
export async function testTenantId(): Promise<number> {
    return TEST_TENANT_ID;
}

/**
 * Run `fn` inside the reserved test tenant's context, mirroring what `tenant_context_middleware`
 * sets up per request: a transaction with `app.current_tenant` set (`SET LOCAL`) and a
 * {@link runWithTenant} scope. Use in unit specs that exercise tenant-scoped services
 * (`SettingsService`, numbering, …) directly rather than over HTTP — those call `currentTenantId()`
 * / `currentTrx()` and would otherwise throw "outside a tenant context".
 */
export async function runInTestTenant<T>(fn: () => Promise<T>): Promise<T> {
    return db.transaction(async (trx) => {
        await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(TEST_TENANT_ID)]);
        return runWithTenant(BigInt(TEST_TENANT_ID), trx, fn);
    });
}

/**
 * Grants the `calibra_admin` role privileges on the test database (grants are per-database; the dev
 * `.env` leaks `DB_ADMIN_USER=calibra_admin` into the test env, so the `postgres_admin` connection
 * authenticates as it). GRANT-only — never creates/alters roles. A no-op in CI where `DB_ADMIN_USER`
 * is unset and `postgres_admin` resolves to the superuser.
 */
export async function bootstrapTestRoles(): Promise<void> {
    const adminUser = env.get("DB_ADMIN_USER");
    if (!adminUser || adminUser === env.get("DB_USER")) {
        return;
    }
    const conn = db.connection();
    const exists = await conn.rawQuery("SELECT 1 FROM pg_roles WHERE rolname = ?", [adminUser]);
    if (exists.rows.length === 0) {
        return;
    }
    const role = `"${adminUser.replaceAll('"', '""')}"`;
    const statements = [
        `GRANT USAGE ON SCHEMA public TO ${role}`,
        `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO ${role}`,
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO ${role}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`,
    ];
    for (const sql of statements) {
        await conn.rawQuery(sql);
    }
}
