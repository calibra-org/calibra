import emitter from "@adonisjs/core/services/emitter";
import { DateTime } from "luxon";

import AdminActionPerformed from "#events/admin_action_performed";
import AdminAuditLog from "#models/admin_audit_log";
import { CacheInvalidation } from "#services/cache_invalidation";

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

/**
 * Order lifecycle → cache invalidation. Every status flip mutates per-customer aggregates and
 * the global counts/reports, so we invalidate `admin:customer:<id>` + `admin:customers` +
 * `admin:reports` on every transition. The fan-out is cheap (tag-only, not key-scan) and keeps
 * the admin dashboard honest with whatever the operator just did.
 *
 * Order:placed is a special case where the order is brand-new — invalidate broadly because the
 * counts (`new_30d`, etc.) move too.
 */
emitter.on("order:status_changed", async ({ order }) => {
    await CacheInvalidation.customerChanged(order.tenantId, order.customerId as bigint | number | null | undefined);
});
emitter.on("order:placed", async ({ order }) => {
    await CacheInvalidation.customerChanged(order.tenantId, order.customerId as bigint | number | null | undefined);
});
emitter.on("order:completed", async ({ order }) => {
    await CacheInvalidation.customerChanged(order.tenantId, order.customerId as bigint | number | null | undefined);
});
emitter.on("order:refunded", async ({ tenantId, customerId }) => {
    await CacheInvalidation.customerChanged(tenantId, customerId);
});
