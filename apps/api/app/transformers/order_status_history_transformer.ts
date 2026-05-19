import { BaseTransformer } from "@adonisjs/core/transformers";

import type OrderStatusHistory from "#models/order_status_history";

/**
 * `forAdmin` is the full audit row including actor + free-text reason. `forCustomer` strips the
 * actor and replaces raw status values with i18n message keys the storefront resolves through its
 * own catalog (Pattern 4 — API never returns translated labels, only the key + raw value).
 */
export default class OrderStatusHistoryTransformer extends BaseTransformer<OrderStatusHistory> {
    toObject() {
        return this.forAdmin();
    }

    forAdmin() {
        const row = this.resource;
        return {
            id: Number(row.id),
            from_status: row.fromStatus,
            to_status: row.toStatus,
            changed_by_user_id: row.changedByUserId === null ? null : Number(row.changedByUserId),
            reason: row.reason,
            occurred_at: row.occurredAt?.toISO() ?? null,
        };
    }

    forCustomer() {
        const row = this.resource;
        return {
            id: Number(row.id),
            from_status: row.fromStatus,
            to_status: row.toStatus,
            occurred_at: row.occurredAt?.toISO() ?? null,
            label_key: row.toStatus === null ? null : `order.status.${row.toStatus}`,
        };
    }
}
