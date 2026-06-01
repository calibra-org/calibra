import { currentTenantId, currentTrx } from "#services/tenant_context";

/**
 * Per-tenant monotonic numbering, replacing the old database-global `order_number_seq` /
 * `refund_number_seq`. Each tenant's `order` / `refund` counters restart independently — tenant A and
 * tenant B can both have order #1000.
 *
 * Allocation runs inside the request transaction (so it rides the tenant's `app.current_tenant` GUC
 * and is covered by the same commit/rollback). The atomic `UPDATE … RETURNING` takes a row lock on
 * the counter, so two concurrent submits for the same tenant serialize at the engine level and never
 * collide or skip a value — gap-free under concurrency, the same guarantee the old sequence gave but
 * scoped per tenant.
 */
export type CounterKind = "order" | "refund";

/** First number handed out for a kind when its counter row doesn't exist yet (matches the old sequences' START 1000). */
const COUNTER_START: Record<CounterKind, number> = {
    order: 1000,
    refund: 1000,
};

/**
 * Allocate and return the next number for `kind` within the current tenant. Must be called inside a
 * tenant context (throws otherwise). The returned number is reserved for this transaction; a
 * rollback releases the row lock but the consumed value is not reused (gap-free is about concurrency,
 * not rollbacks — same semantics as a sequence).
 */
export async function nextNumber(kind: CounterKind): Promise<number> {
    const tenantId = currentTenantId();
    const trx = currentTrx();
    const start = COUNTER_START[kind];

    /** Seed the counter row at `start` if absent; the increment below hands out `start` first. */
    await trx
        .table("tenant_number_counters")
        .insert({ tenant_id: tenantId, kind, next_value: start })
        .onConflict(["tenant_id", "kind"])
        .ignore();

    const result = await trx.rawQuery(
        "UPDATE tenant_number_counters SET next_value = next_value + 1, updated_at = now() WHERE tenant_id = ? AND kind = ? RETURNING next_value - 1 AS allocated",
        [String(tenantId), kind],
    );

    return Number(result.rows[0].allocated);
}
