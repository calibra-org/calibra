import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";

import { CacheKeys, CacheTags } from "#services/cache_keys";

/**
 * Minimal tenant projection the middleware needs to open the per-request context. Resolved on the
 * admin connection (BYPASSRLS) — `tenants`/`tenant_domains` are global, but the admin connection
 * guarantees the lookup is never itself RLS-filtered.
 */
export interface ResolvedTenant {
    id: number | string;
    slug: string;
    status: string;
    connectionName: string | null;
    currencyCode: string;
    primaryLocale: string;
}

const ADMIN_CONNECTION = "postgres_admin";

/** knex object-select maps `{ alias: "table.column" }`. */
const COLUMNS = {
    id: "tenants.id",
    slug: "tenants.slug",
    status: "tenants.status",
    connectionName: "tenants.connection_name",
    currencyCode: "tenants.currency_code",
    primaryLocale: "tenants.primary_locale",
};

/**
 * Resolve a tenant by the `X-Calibra-Tenant` reference, which the web/admin BFFs set to either the
 * numeric tenant id or the slug. Short-TTL cached + tagged so Phase 5 can invalidate on edits.
 */
export function resolveTenantByRef(ref: string): Promise<ResolvedTenant | null> {
    return cache.getOrSet({
        key: CacheKeys.tenant.byRef(ref),
        ttl: "60s",
        tags: [CacheTags.tenants],
        factory: async () => {
            const query = db.connection(ADMIN_CONNECTION).from("tenants").select(COLUMNS).whereNull("deleted_at");
            if (/^\d+$/.test(ref)) {
                query.where("id", ref);
            } else {
                query.where("slug", ref);
            }
            const row = await query.first();
            return (row as ResolvedTenant | undefined) ?? null;
        },
    });
}

/** Resolve a tenant by request Host → `tenant_domains.domain`. */
export function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
    return cache.getOrSet({
        key: CacheKeys.tenant.byHost(host),
        ttl: "60s",
        tags: [CacheTags.tenants],
        factory: async () => {
            const row = await db
                .connection(ADMIN_CONNECTION)
                .from("tenant_domains")
                .join("tenants", "tenants.id", "tenant_domains.tenant_id")
                .where("tenant_domains.domain", host)
                .whereNull("tenants.deleted_at")
                .select(COLUMNS)
                .first();
            return (row as ResolvedTenant | undefined) ?? null;
        },
    });
}
