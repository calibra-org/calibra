import type { NormalizeConstructor } from "@adonisjs/core/types/helpers";
import { type BaseModel, beforeCreate } from "@adonisjs/lucid/orm";
import type { LucidRow } from "@adonisjs/lucid/types/model";

import { maybeTenantContext } from "#services/tenant_context";

/**
 * Mixin that makes a Lucid model tenant-aware so callers never have to thread the tenant by hand:
 *
 *  - **On insert** (`@beforeCreate`) it stamps `tenant_id` from the active context (if unset) so the
 *    row satisfies the RLS `WITH CHECK` policy, and binds the row to the request transaction so the
 *    write rides the connection that has `app.current_tenant` set.
 *  - **On read** it overrides the static `query()` to default the query client to the request
 *    transaction, so `Model.query()` inside a request automatically rides the GUC-bearing connection.
 *    Without this, a query on a fresh pooled connection (no GUC) returns zero rows under fail-closed
 *    RLS.
 *
 * On a global / platform path (no tenant context) both behaviours are no-ops and the model queries
 * the default connection as usual. Apply via `compose(<Entity>Schema, TenantScoped)`.
 */
export function TenantScoped<T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
    class TenantScopedModel extends superclass {
        @beforeCreate()
        static stampTenant(row: LucidRow & { tenantId?: bigint | number | null }) {
            const ctx = maybeTenantContext();
            if (!ctx) return;
            if (row.tenantId === undefined || row.tenantId === null) {
                row.tenantId = ctx.tenantId;
            }
            if (!row.$trx) {
                row.useTransaction(ctx.trx);
            }
        }

        static query(...args: any[]) {
            const ctx = maybeTenantContext();
            if (ctx && (args[0] === undefined || args[0].client === undefined)) {
                args[0] = { ...(args[0] ?? {}), client: ctx.trx };
            }
            /**
             * `super.query` keeps `this` bound to the concrete model (e.g. `User`) so its
             * `static table` is used. A bare `superclass.query(...)` binds `this` to the mixin class
             * and derives a bogus table name from its constructor name — the ignore below stops Biome
             * "fixing" it into that broken form.
             */
            // biome-ignore lint/complexity/noThisInStatic: super preserves `this` as the concrete model so the correct table resolves
            return super.query(...args);
        }
    }

    return TenantScopedModel;
}
