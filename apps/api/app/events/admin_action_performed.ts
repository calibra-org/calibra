import { BaseEvent } from "@adonisjs/core/events";

/**
 * Fired whenever an admin operator does something the audit log should remember —
 * impersonation, refund, override, soft-delete, force-publish, etc. A listener (in
 * `start/events.ts`) writes the row, keeping controllers free of audit-log plumbing.
 *
 * Use `AdminActionPerformed.dispatch(payload)` from any controller/service that
 * effects a state change worth keeping. The transformer + admin UI already render
 * `admin_audit_log` rows; nothing changes downstream.
 */
export default class AdminActionPerformed extends BaseEvent {
    constructor(
        public payload: {
            actorUserId: bigint | number | null;
            action: string;
            entityKind: string;
            entityId: bigint | number | null;
            requestId?: string | null;
            ipAddress?: string | null;
            payload?: Record<string, unknown>;
        },
    ) {
        super();
    }
}
