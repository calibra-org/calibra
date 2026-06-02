import { AsyncLocalStorage } from "node:async_hooks";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

/**
 * Per-request tenant context, carried through the async call tree by `AsyncLocalStorage` so any
 * code reached from a request — controllers, services, model hooks — can read the active tenant
 * without threading it through every signature.
 *
 * `trx` is the per-request transaction opened by `tenant_context_middleware`; it has already issued
 * `SET LOCAL app.current_tenant = <id>` as its first statement, so every query that runs on this
 * transaction is filtered by the RLS policy. Tenant-scoped DB work MUST ride this transaction (the
 * {@link [TenantScoped]} mixin binds models to it automatically) — a query on a fresh pooled
 * connection has no GUC and, thanks to fail-closed RLS, returns zero rows.
 */
export interface TenantContext {
    tenantId: bigint;
    trx: TransactionClientContract;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with the given tenant context active. Everything awaited inside sees the same
 * `tenantId` + `trx` via {@link currentTenantId} / {@link currentTrx}.
 */
export function runWithTenant<T>(tenantId: bigint, trx: TransactionClientContract, fn: () => T): T {
    return storage.run({ tenantId, trx }, fn);
}

/** The active context, or `undefined` on a global / platform / pre-middleware path. */
export function maybeTenantContext(): TenantContext | undefined {
    return storage.getStore();
}

/** The active tenant id, or `null` when none is set (global paths). */
export function maybeTenantId(): bigint | null {
    return storage.getStore()?.tenantId ?? null;
}

/**
 * The active tenant id on a tenant-scoped path. Throws if called with no context — that signals a
 * tenant-scoped operation leaked onto a global path, a bug we want loud rather than silently
 * fail-closed.
 */
export function currentTenantId(): bigint {
    const store = storage.getStore();
    if (!store) {
        throw new Error("currentTenantId() called outside a tenant context. Is tenant_context_middleware mounted?");
    }
    return store.tenantId;
}

/** The active request transaction. Throws when no tenant context is set (see {@link currentTenantId}). */
export function currentTrx(): TransactionClientContract {
    const store = storage.getStore();
    if (!store) {
        throw new Error("currentTrx() called outside a tenant context. Is tenant_context_middleware mounted?");
    }
    return store.trx;
}

/**
 * Drop-in replacement for `db.transaction(callback)` that keeps tenant-scoped work on the
 * **request transaction**. `tenant_context_middleware` already wraps the whole request in a
 * transaction carrying the `app.current_tenant` GUC; a controller that opened its own
 * `db.transaction()` would run on a *separate* connection that cannot see rows written earlier in
 * the request (e.g. the cart materialized by `cart_middleware`) — producing FK violations and lock
 * contention against the still-open request transaction.
 *
 * When a tenant context is active the callback runs **directly on the request transaction** rather
 * than in a nested SAVEPOINT. This is deliberate: a savepoint releases its locks to the parent on
 * RELEASE, but a model loaded inside the savepoint keeps a reference to the now-closed savepoint, so
 * a later `model.save()` falls back to a *fresh pooled connection* and deadlocks against the lock the
 * parent still holds (e.g. `payment_service.linkLatest` saving an order locked `FOR UPDATE` moments
 * earlier). Reusing the single request transaction means every read, write, and lock lives on one
 * connection — self-deadlock is impossible, and the middleware's commit/rollback at request end is
 * the atomic boundary. On a global / platform / background path (no context) it falls back to a fresh
 * `db.transaction`, preserving the previous behaviour.
 */
export function withTenantTransaction<T>(callback: (trx: TransactionClientContract) => Promise<T>): Promise<T> {
    const store = storage.getStore();
    if (store) {
        return callback(store.trx);
    }
    return db.transaction(callback);
}
