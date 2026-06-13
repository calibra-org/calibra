import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";

import { CacheKeys, CacheTags } from "#services/cache_keys";
import { ROUTABLE_DOMAIN_SQL } from "#services/domain_routing";

/**
 * Minimal tenant projection the middleware needs to open the per-request context. Resolved on the
 * admin connection (BYPASSRLS) — `tenants`/`tenant_domains` are global, but the admin connection
 * guarantees the lookup is never itself RLS-filtered.
 */
export interface ResolvedTenant {
    id: number | string;
    slug: string;
    name: string;
    status: string;
    connectionName: string | null;
    currencyCode: string;
    primaryLocale: string;
    /** Which storefront codebase renders this tenant; `apps/web` serves `"default"` (see RULE C). */
    templateKey: string;
}

const ADMIN_CONNECTION = "postgres_admin";

/** knex object-select maps `{ alias: "table.column" }`. */
const COLUMNS = {
    id: "tenants.id",
    slug: "tenants.slug",
    name: "tenants.name",
    status: "tenants.status",
    connectionName: "tenants.connection_name",
    currencyCode: "tenants.currency_code",
    primaryLocale: "tenants.primary_locale",
    templateKey: "tenants.template_key",
};

/**
 * Resolve a tenant by the `X-Calibra-Tenant` reference, which the web/admin BFFs set to the numeric
 * tenant id, the slug, or — for a custom-domain storefront the BFF can't map to a slug itself — the
 * verbatim hostname. A ref containing a dot is treated as a custom domain and resolved through
 * `tenant_domains`; everything else is an id (all digits) or a slug. Short-TTL cached + tagged so
 * Phase 5 can invalidate on edits.
 */
export function resolveTenantByRef(ref: string): Promise<ResolvedTenant | null> {
    if (ref.includes(".")) {
        return resolveTenantByHost(ref);
    }
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

/**
 * Resolve a tenant by request Host → `tenant_domains.domain`, gated by the R5 routing predicate
 * ({@link ROUTABLE_DOMAIN_SQL}): a subdomain always resolves, but a custom domain resolves to NOTHING
 * until BOTH verification gates pass and its cert is issuing/active — exactly matching the edge
 * `/api/caddy/ask` decision so a half-verified custom host is unrouted (404) instead of silently
 * serving the shop on an unverified hostname.
 */
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
                .whereRaw(ROUTABLE_DOMAIN_SQL)
                .whereNull("tenants.deleted_at")
                .select(COLUMNS)
                .first();
            return (row as ResolvedTenant | undefined) ?? null;
        },
    });
}
