import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import PlatformAuditEvent from "#models/platform_audit_event";

/** The fixed action vocabulary mirrored by the `platform_audit_events_action_check` constraint. */
export type PlatformAuditAction =
    | "tenant_provisioned"
    | "tenant_updated"
    | "domain_added"
    | "domain_removed"
    | "operator_created"
    | "operator_disabled"
    | "operator_enabled"
    | "operator_removed"
    | "password_rotated"
    | "handoff_link_issued"
    | "ownership_transferred";

export interface PlatformAuditInput {
    /** The acting platform operator; null only for system-initiated actions. */
    platformUserId: bigint | number | null;
    tenantId: bigint | number;
    /** The affected tenant `users` row, when the action targets a specific operator. */
    targetUserId?: bigint | number | null;
    action: PlatformAuditAction;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
}

/**
 * Append a control-plane audit row inside the caller's `admin().transaction()` so the audit and the
 * mutation it records commit or roll back together. Never store secrets in `metadata` (no passwords,
 * no reset tokens) — only ids and non-sensitive descriptors.
 */
export async function recordPlatformAudit(trx: TransactionClientContract, input: PlatformAuditInput): Promise<void> {
    const row = new PlatformAuditEvent();
    row.platformUserId = input.platformUserId === null ? null : Number(input.platformUserId);
    row.tenantId = Number(input.tenantId);
    row.targetUserId = input.targetUserId === undefined || input.targetUserId === null ? null : Number(input.targetUserId);
    row.action = input.action;
    row.metadata = input.metadata ?? {};
    row.ipAddress = input.ipAddress ?? null;
    row.userAgent = input.userAgent ?? null;
    row.createdAt = DateTime.utc();
    row.useTransaction(trx);
    await row.save();
}
