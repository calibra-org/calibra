/**
 * Global tenant-stamping for every per-tenant model. Rather than add the `TenantScoped` mixin to
 * ~85 model files, this preload auto-discovers the models in `app/models/` and registers a single
 * `before('create')` hook on each one that declares a `tenantId` column. Registering on the concrete
 * model class (not the generated `<Entity>Schema` base) is required — Lucid does NOT propagate a
 * parent class's dynamically-added hooks to already-resolved subclasses.
 *
 * The hook stamps `tenant_id` from the active request context (when unset) so model-driven inserts
 * satisfy the RLS `WITH CHECK` policy, and binds the row to the request transaction so the write
 * rides the GUC-bearing connection. On a global / platform / no-context path it is a no-op (raw
 * inserts and the seeder set `tenant_id` explicitly).
 *
 * `User` / `OtpCode` additionally use the `TenantScoped` mixin for its read-side `query()` override;
 * the duplicate create-stamp is idempotent.
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
}
