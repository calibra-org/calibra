import emitter from "@adonisjs/core/services/emitter";
import { DateTime } from "luxon";

import AdminActionPerformed from "#events/admin_action_performed";
import AdminAuditLog from "#models/admin_audit_log";

/**
 * Wire domain events to their listeners. Each listener does exactly one thing — keeping
 * the bus uni-directional + testable (see `emitter.fake()` for `assertEmitted` /
 * `assertNotEmitted` patterns).
 *
 * Add a new domain event by exporting a {@link BaseEvent} subclass under `app/events/`
 * and registering its handler below. Inline handlers are fine for one-shot mappings;
 * promote to `app/listeners/*.ts` when the handler grows past a few lines.
 */
emitter.on(AdminActionPerformed, async (event) => {
    try {
        const row = new AdminAuditLog();
        row.actorUserId = event.payload.actorUserId;
        row.action = event.payload.action;
        row.entityKind = event.payload.entityKind;
        row.entityId = event.payload.entityId;
        row.payload = event.payload.payload ?? {};
        row.ipAddress = event.payload.ipAddress ?? null;
        row.occurredAt = DateTime.utc();
        await row.save();
    } catch {
        /** Swallow — never let an audit failure break the actor's request. */
    }
});
