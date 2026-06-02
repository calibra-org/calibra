/**
 * Global tenant-scoping for every per-tenant model. Rather than add the `TenantScoped` mixin to
 * ~85 model files, this preload auto-discovers the models in `app/models/` and applies the same two
 * behaviours to each one that declares a `tenantId` column. Operating on the concrete model class
 * (not the generated `<Entity>Schema` base) is required — Lucid does NOT propagate a parent class's
 * dynamically-added hooks/overrides to already-resolved subclasses.
 *
 *  - **On insert** a `before('create')` hook stamps `tenant_id` from the active request context (when
 *    unset) so the row satisfies the RLS `WITH CHECK` policy, and binds the row to the request
 *    transaction so the write rides the GUC-bearing connection.
 *  - **On read** the static `query()` is wrapped to default the query client to the request
 *    transaction. This is load-bearing: `tenant_context_middleware` wraps the whole request in one
 *    transaction, so a plain `Model.query()` on a fresh pooled connection neither sees rows written
 *    earlier in the same request (read-after-write) nor — under fail-closed RLS on `calibra_app` —
 *    any tenant rows at all. Because static `find`/`findBy`/`first`/relation preloads all funnel
 *    through `query()`, wrapping it covers the whole read surface.
 *
 * On a global / platform / no-context path both behaviours are no-ops and the model uses the default
 * connection as usual (raw inserts and the seeder set `tenant_id` explicitly).
 *
 * `User` / `OtpCode` additionally use the `TenantScoped` mixin; the duplicate create-stamp and the
 * idempotent `client`-already-set guard make the double application harmless.
 */
import { readdir } from "node:fs/promises";
import { BaseModel } from "@adonisjs/lucid/orm";
import type { LucidRow } from "@adonisjs/lucid/types/model";

import { maybeTenantContext } from "#services/tenant_context";

function stampTenant(row: LucidRow & { tenantId?: bigint | number | null }) {
    const ctx = maybeTenantContext();
    if (!ctx) {
        return;
    }
    if (row.tenantId === undefined || row.tenantId === null) {
        row.tenantId = ctx.tenantId;
    }
    if (!row.$trx) {
        row.useTransaction(ctx.trx);
    }
}

/**
 * Wrap the model's static `query()` so it rides the request transaction when a tenant context is
 * active. `inherited` is resolved off the prototype chain and invoked with the concrete model as
 * `this`, so the correct `static table` resolves (the same reason {@link TenantScoped} uses
 * `super.query`). Internal `this.query()` callers (`find`, `first`, …) hit this wrapper, not
 * `inherited`, so there is no recursion.
 */
function bindQueryToTenant(model: typeof BaseModel): void {
    const inherited = Object.getPrototypeOf(model).query as (...args: any[]) => unknown;
    model.query = function tenantScopedQuery(this: typeof BaseModel, ...args: any[]) {
        const ctx = maybeTenantContext();
        if (ctx && (args[0] === undefined || args[0].client === undefined)) {
            args[0] = { ...(args[0] ?? {}), client: ctx.trx };
        }
        return inherited.apply(this, args);
    } as typeof model.query;
}

const modelsDir = new URL("../app/models/", import.meta.url);
const entries = await readdir(modelsDir);

for (const file of entries) {
    if (!file.endsWith(".js") && !file.endsWith(".ts")) {
        continue;
    }
    const imported = await import(new URL(file, modelsDir).href);
    const model = imported.default as (typeof BaseModel & { $columns?: readonly string[] }) | undefined;
    if (typeof model !== "function" || !(model.prototype instanceof BaseModel)) {
        continue;
    }
    model.boot();
    if (!Array.isArray(model.$columns) || !model.$columns.includes("tenantId")) {
        continue;
    }
    model.before("create", stampTenant);
    bindQueryToTenant(model);
}
