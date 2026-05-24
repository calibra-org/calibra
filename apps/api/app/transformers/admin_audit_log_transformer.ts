import { BaseTransformer } from "@adonisjs/core/transformers";

import type AdminAuditLog from "#models/admin_audit_log";

export default class AdminAuditLogTransformer extends BaseTransformer<AdminAuditLog> {
    toObject() {
        const actor = this.resource.actor ?? null;
        return {
            id: String(this.resource.id),
            actor: actor ? { id: String(actor.id), email: actor.email } : null,
            action: this.resource.action,
            entity_kind: this.resource.entityKind,
            entity_id: this.resource.entityId === null ? null : String(this.resource.entityId),
            payload: this.resource.payload ?? {},
            ip_address: this.resource.ipAddress,
            occurred_at: this.resource.occurredAt?.toISO() ?? null,
        };
    }
}
