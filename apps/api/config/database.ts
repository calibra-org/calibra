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
