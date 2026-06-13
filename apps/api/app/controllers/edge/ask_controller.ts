import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import { CacheKeys, CacheTags } from "#services/cache_keys";
import { ROUTABLE_DOMAIN_SQL } from "#services/domain_routing";
import env from "#start/env";

/**
 * Edge TLS-authorize endpoint — the on-demand-TLS oracle the edge (spin agent locally, Caddy in prod)
 * calls before minting a certificate for an inbound host. THIS IS THE SINGLE UNAUTHENTICATED,
 * BYPASSRLS-FACING SURFACE in the app, so it is deliberately minimal and locked down:
 *
 *  - **Source allowlist** — only a caller presenting the shared `X-Edge-Secret` (set by the spin
 *    agent + prod Caddy) is honoured; a missing/blank `EDGE_SECRET` config fails the endpoint closed.
 *  - **Boolean oracle only** — `200` (empty body) iff the host is routable under the R5 predicate
 *    ({@link ROUTABLE_DOMAIN_SQL}); `403` otherwise. The response carries NO tenant information, so a
 *    probe learns only "is this host live", never which tenant owns it.
 *  - **Rate limited** (`edgeAskLimiter`) and **cached** (positive + negative, short TTL, busted by
 *    `CacheTags.tenants`) so domain churn propagates fast but a hammering caller is cheap to absorb.
 *
 * Runs on the `postgres_admin` connection (no tenant GUC); `tenant_domains` is a global table keyed by
 * the unique `domain`, so the lookup needs no `tenant_id` filter and leaks nothing.
 */
export default class EdgeAskController {
    async handle(ctx: HttpContext) {
        const secret = env.get("EDGE_SECRET");
        const presented = ctx.request.header("x-edge-secret");
        if (!secret || presented !== secret) {
            return ctx.response.status(403).send("");
        }

        const host = String(ctx.request.input("domain", "")).trim().toLowerCase();
        if (!host) {
            return ctx.response.status(403).send("");
        }

        const routable = await cache.getOrSet({
            key: CacheKeys.tenant.edgeAsk(host),
            ttl: "30s",
            tags: [CacheTags.tenants],
            factory: async () => {
                const row = await db
                    .connection("postgres_admin")
                    .from("tenant_domains")
                    .where("tenant_domains.domain", host)
                    .whereRaw(ROUTABLE_DOMAIN_SQL)
                    .select("tenant_domains.id")
                    .first();
                return Boolean(row);
            },
        });

        return ctx.response.status(routable ? 200 : 403).send("");
    }
}
