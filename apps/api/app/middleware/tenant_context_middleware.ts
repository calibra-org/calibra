import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";
import db from "@adonisjs/lucid/services/db";

import { resolveTenantConnection } from "#config/database";
import { runWithTenant } from "#services/tenant_context";
import { type ResolvedTenant, resolveTenantByHost, resolveTenantByRef } from "#services/tenant_resolver";

/**
 * Establishes per-request tenant context — the load-bearing seam for the whole platform. Mounted at
 * the server level (after locale detection, before metrics) so it wraps every matched + unmatched
 * request.
 *
 * Resolution order: the `X-Calibra-Tenant` header (id or slug, set by the web/admin BFFs) first, then
 * the request Host → `tenant_domains`. Platform (`/api/v1/platform/*`) and infra (`/health*`,
 * `/metrics`) routes are global and skip resolution entirely.
 *
 * When a tenant resolves, the middleware opens a transaction on the tenant's connection, sets the
 * `app.current_tenant` GUC transaction-locally (`set_config(..., true)` ≡ `SET LOCAL`, safe under
 * PgBouncer transaction pooling), and runs the rest of the request inside `runWithTenant`. Commit on
 * success, rollback on error.
 *
 * Resolution outcomes:
 *  - tenant indicated (header) but not found → **404** (no silent fallthrough to another tenant).
 *  - tenant resolved but `status != active` → **503** (suspended/archived shop).
 *  - no tenant indicated at all (e.g. a direct, un-tenanted dev/test call) → proceed WITHOUT context.
 *    Such a request runs on the default `calibra_app` connection with no GUC, so fail-closed RLS
 *    returns zero rows for any per-tenant table — never another tenant's data.
 */
export default class TenantContextMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const path = ctx.request.url();
        if (
            path.startsWith("/api/v1/platform") ||
            path.startsWith("/api/v1/webhooks/channels") ||
            path.startsWith("/health") ||
            path === "/metrics"
        ) {
            return next();
        }

        const headerRef = ctx.request.header("X-Calibra-Tenant")?.trim();
        let tenant: ResolvedTenant | null = null;

        if (headerRef) {
            tenant = await resolveTenantByRef(headerRef);
            if (!tenant) {
                return ctx.response.status(404).send({ errors: [{ message: "Tenant not found", code: "E_TENANT_NOT_FOUND" }] });
            }
        } else {
            const host = ctx.request.header("Host")?.split(":")[0];
            if (host) {
                tenant = await resolveTenantByHost(host);
            }
        }

        if (!tenant) {
            return next();
        }

        if (tenant.status !== "active") {
            return ctx.response
                .status(503)
                .send({ errors: [{ message: "This shop is currently unavailable", code: "E_TENANT_UNAVAILABLE" }] });
        }

        const trx = await db.connection(resolveTenantConnection(tenant)).transaction();
        try {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenant.id)]);
            await runWithTenant(BigInt(tenant.id), trx, () => next());
        } catch (error) {
            /**
             * Defensive: AdonisJS catches handler errors at the server level and renders them, so
             * `next()` usually resolves even on failure (the response status is the real signal —
             * see below). This catch only fires for errors thrown by the middleware itself.
             */
            if (!trx.isCompleted) {
                await trx.rollback();
            }
            throw error;
        }

        /**
         * Commit only on success. Because the framework swallows handler exceptions into a rendered
         * error response, a thrown handler leaves `next()` resolved — so the response status is the
         * authoritative commit/rollback signal. Any 4xx/5xx rolls back the per-request transaction,
         * guaranteeing a failed request never persists a partial write.
         */
        if (trx.isCompleted) {
            return;
        }
        if (ctx.response.getStatus() >= 400) {
            await trx.rollback();
        } else {
            await trx.commit();
        }
    }
}
