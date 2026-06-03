import { defineConfig } from "@adonisjs/lucid";

import env from "#start/env";

/**
 * Lucid database config for the multi-tenant bridge model. Two roles share one Postgres:
 *
 *  - **`postgres`** (default) — the runtime app role `calibra_app` (NOBYPASSRLS). Every request
 *    queries through this connection, so Row-Level Security is *always* enforced. A request that
 *    forgets to set the `app.current_tenant` GUC sees zero rows (fail-closed), never another
 *    tenant's data.
 *  - **`postgres_admin`** — the admin role `calibra_admin` (BYPASSRLS). Migrations, seeders, and the
 *    queue worker run here so they can read/write across tenants. Run migrations with
 *    `node ace migration:run --connection=postgres_admin` and seeders with
 *    `node ace db:seed --connection=postgres_admin`.
 *
 * Both connections target the same database; they differ only in the Postgres role (and thus
 * whether RLS applies). The admin/superuser credentials fall back to `DB_USER` when unset so an
 * un-migrated env still boots — but that collapses the isolation boundary, so production and the
 * spin set the distinct roles. Roles are created once by `node ace db:bootstrap-roles`.
 *
 * @see https://lucid.adonisjs.com/docs/configuration
 */
const sharedDatabase = env.get("DB_DATABASE");
const host = env.get("DB_HOST");
const port = env.get("DB_PORT");

/**
 * TEST-ONLY pool hook. When `DB_DEFAULT_TENANT` is set (only `.env.test`), every connection seeds a
 * session-level `app.current_tenant` at creation, so the `tenant_id` column default fills for
 * factory/seeder inserts that run outside a request. This is robust against connection-pool timing —
 * unlike a login-time role/database default, which connections opened before test bootstrap would
 * miss. Per-request work overrides it via `SET LOCAL` in `tenant_context_middleware`; the RLS
 * isolation spec opens a separate `calibra_app` connection WITHOUT this hook to prove fail-closed
 * behaviour. Empty (no hook) in production, where a session-level default would collapse isolation.
 */
const defaultTenant = env.get("DB_DEFAULT_TENANT");

/**
 * Pool sizing. The bridge model wraps each request in a transaction that holds **one** connection
 * for the request's whole lifetime (the `app.current_tenant` GUC lives on it), so the effective
 * concurrency ceiling is the pool's `max` — Knex's default of 10 is too low for an admin dashboard
 * that fans out many parallel widget calls (the source of the `KnexTimeoutError: pool is full`
 * 500s). Default to 20, overridable via `DB_POOL_MAX`.
 */
const poolMax = Math.max(4, Number(process.env.DB_POOL_MAX ?? 20));
const basePool = { min: 0, max: poolMax };
const poolConfig = defaultTenant
    ? {
          pool: {
              ...basePool,
              afterCreate(
                  connection: { query: (sql: string, cb: (err: Error | null) => void) => void },
                  done: (err: Error | null, connection: unknown) => void,
              ) {
                  connection.query(`SET app.current_tenant = '${defaultTenant}'`, (err) => done(err, connection));
              },
          },
      }
    : { pool: basePool };

const dbConfig = defineConfig({
    connection: "postgres",
    connections: {
        postgres: {
            client: "pg",
            connection: {
                host,
                port,
                user: env.get("DB_USER"),
                password: env.get("DB_PASSWORD"),
                database: sharedDatabase,
            },
            ...poolConfig,
            migrations: {
                naturalSort: true,
                paths: ["database/migrations"],
            },
            seeders: {
                paths: ["database/seeders"],
            },
        },

        postgres_admin: {
            client: "pg",
            connection: {
                host,
                port,
                user: env.get("DB_ADMIN_USER") ?? env.get("DB_USER"),
                password: env.get("DB_ADMIN_PASSWORD") ?? env.get("DB_PASSWORD"),
                database: sharedDatabase,
            },
            ...poolConfig,
            migrations: {
                naturalSort: true,
                paths: ["database/migrations"],
            },
            seeders: {
                paths: ["database/seeders"],
            },
        },
    },
});

export default dbConfig;

/**
 * Connection-resolver seam for the bridge → dedicated-DB promotion path. Today every tenant lives in
 * the shared Postgres, so `connection_name` is NULL and this returns the default `'postgres'`
 * connection. When a whale tenant is promoted to its own database (a future phase), provisioning
 * stamps `tenants.connection_name` and dynamically registers that connection via
 * `db.manager.add(name, config)` — at which point this resolver routes the request to it WITHOUT
 * any controller change. Keeping the seam here means promotion is a config change, not a rewrite.
 *
 * TODO(phase: dedicated-db): register dynamic connections from `tenants.connection_name` at boot /
 * on-promote, then this resolver returns that name. Out of scope for Phase 1.
 *
 * @param tenant - the resolved tenant row (only `connection_name` is read).
 * @returns the Lucid connection name to run the tenant's queries against.
 */
export function resolveTenantConnection(tenant: { connectionName?: string | null }): string {
    return tenant.connectionName ?? "postgres";
}
