import db from "@adonisjs/lucid/services/db";

import { maybeTenantContext, runWithTenant } from "#services/tenant_context";

/**
 * Run a queue job's body inside the owning row's tenant context, mirroring what
 * `tenant_context_middleware` does per request.
 *
 * The worker process has no request, so `currentTenantId()`/`currentTrx()` would throw and a bare
 * `withTenantTransaction` would fall back to a context-less `db.transaction` — writes would land
 * without `tenant_id` and reads would be RLS-filtered to zero rows under `calibra_app`. This:
 *
 *  1. **Discovers** the owning row's `tenant_id` on `postgres_admin` (BYPASSRLS) — the only way to
 *     read a per-tenant row before any GUC is set.
 *  2. Runs the body on the **default (`calibra_app`) connection** in a transaction that issues
 *     `SET LOCAL app.current_tenant`, inside {@link runWithTenant}. The body therefore rides the
 *     fail-closed runtime role exactly like a request: RLS scopes every read/write to the tenant
 *     (NOT BYPASSRLS — a body on `postgres_admin` would see *every* tenant's rows, e.g. matching a
 *     per-tenant-unique SKU across shops).
 *
 * **Inline (sync-driver) dispatch already has a tenant context** — the dispatching request's
 * transaction, in which the owning row was just created and is not yet committed (so it is invisible
 * to a separate connection). There the body runs directly on the caller's context, preserving
 * read-after-write. The branch is on `maybeTenantContext()`, not the queue driver.
 *
 * When the row cannot be found on a context-less path (deleted before the worker picked it up) the
 * body still runs unscoped so the runner can log its own "row missing — abort" path cleanly.
 *
 * @param table - the owning row's table (`product_imports` / `product_exports`).
 * @param id - the owning row's id, read from the job payload.
 * @param run - the runner invocation (e.g. `() => runImport(payload)`).
 */
export async function withJobTenantContext(table: string, id: number, run: () => Promise<void>): Promise<void> {
    if (maybeTenantContext()) {
        await run();
        return;
    }

    const row = (await db.connection("postgres_admin").from(table).where("id", id).select("tenant_id").first()) as
        | { tenant_id: number | string | bigint }
        | undefined;
    if (!row) {
        await run();
        return;
    }

    const tenantId = BigInt(row.tenant_id);
    await db.connection().transaction(async (trx) => {
        await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
        await runWithTenant(tenantId, trx, run);
    });
}
