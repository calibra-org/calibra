import db from "@adonisjs/lucid/services/db";

import { runWithTenant } from "#services/tenant_context";

/**
 * Run `body` once per tenant inside a fully-scoped tenant context — the building block for
 * cross-tenant background commands (cart purge, payment reconcile, media variant backfill).
 *
 * Tenant ids are discovered on `postgres_admin` (BYPASSRLS; `tenants` is a global table). Each
 * iteration then opens a transaction on the **default (`calibra_app`) connection**, issues
 * `SET LOCAL app.current_tenant` and runs `body` inside {@link runWithTenant} — exactly what
 * `tenant_context_middleware` does per request. The body therefore rides the fail-closed runtime
 * role, so `Model.query()` / `currentTrx()` reads and writes are RLS-scoped to the one tenant. (A
 * body run on `postgres_admin` would bypass RLS and see *every* tenant's rows on each pass.)
 *
 * Pass `onlyTenantId` to target a single shop (e.g. a command's `--tenant` flag).
 *
 * @returns the tenant ids that were processed, in ascending order.
 */
export async function forEachTenant(body: (tenantId: bigint) => Promise<void>, onlyTenantId?: number): Promise<bigint[]> {
    const ids =
        onlyTenantId !== undefined
            ? [BigInt(onlyTenantId)]
            : (
                  (await db
                      .connection("postgres_admin")
                      .from("tenants")
                      .whereNull("deleted_at")
                      .orderBy("id", "asc")
                      .select("id")) as Array<{ id: number | string }>
              ).map((row) => BigInt(row.id));

    for (const tenantId of ids) {
        await db.connection().transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            await runWithTenant(tenantId, trx, () => body(tenantId));
        });
    }

    return ids;
}
