/**
 * The single R5 routing/issuance predicate, expressed once as a SQL fragment so the two enforcement
 * points — `tenant_resolver.resolveTenantByHost` and the edge `GET /api/caddy/ask` endpoint — apply a
 * byte-identical rule. Any drift between them would produce local-green / prod-red TLS behaviour, so
 * they MUST share this constant rather than each spelling the predicate out.
 *
 * A row is routable when it is a `subdomain` (implicitly trusted — `<slug>.shops.calibra.app`), OR a
 * `custom` domain that has passed BOTH gates (`ownership_verified_at` + `routing_verified_at`) and is
 * currently issuing or serving a cert (`tls_status IN ('verifying','active')`). Everything else
 * (pending / failed / half-verified custom domains) does not route and does not get TLS.
 *
 * References the `tenant_domains` table by name, so callers must keep that alias on the query.
 */
export const ROUTABLE_TLS_STATUSES = ["verifying", "active"] as const;

export const ROUTABLE_DOMAIN_SQL =
    "(tenant_domains.kind = 'subdomain' OR (" +
    "tenant_domains.ownership_verified_at IS NOT NULL AND " +
    "tenant_domains.routing_verified_at IS NOT NULL AND " +
    "tenant_domains.tls_status IN ('verifying', 'active')))";
