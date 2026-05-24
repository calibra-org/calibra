import type { HttpContext } from "@adonisjs/core/http";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import AdminAuditLog from "#models/admin_audit_log";

export interface RecordAuditOptions {
    ctx?: HttpContext;
    actorUserId?: bigint | number | null;
    action: string;
    entityKind: string;
    entityId: bigint | number | null;
    payload?: Record<string, unknown>;
    trx?: TransactionClientContract;
}

/**
 * Persists an admin-action row to `admin_audit_log`. Pass `ctx` to auto-derive the actor and the
 * IP address; pass `actorUserId` explicitly when the action runs outside the request lifecycle
 * (background jobs, etc.). Never blocks the calling request — failures are logged but swallowed.
 */
export async function recordAudit(options: RecordAuditOptions): Promise<void> {
    const { ctx, actorUserId, action, entityKind, entityId, payload, trx } = options;
    let resolvedActor: bigint | number | null = actorUserId ?? null;
    if (resolvedActor === null && ctx) {
        try {
            const user = await ctx.auth.authenticate();
            resolvedActor = Number(user.id);
        } catch {
            /** unauthenticated path — leave actor null. */
        }
    }
    try {
        const row = new AdminAuditLog();
        row.actorUserId = resolvedActor;
        row.action = action;
        row.entityKind = entityKind;
        row.entityId = entityId;
        row.payload = payload ?? {};
        row.ipAddress = ctx?.request.ip() ?? null;
        row.occurredAt = DateTime.utc();
        if (trx) row.useTransaction(trx);
        await row.save();
    } catch (error) {
        ctx?.logger.warn({ err: error }, "admin_audit_log_write_failed");
    }
}
