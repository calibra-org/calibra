import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import OrderStatusHistory from "#models/order_status_history";

/**
 * Admin order-history list view (sub-resource scoped by `order_id` on the parent route). Order
 * pre-scope is the authorisation surface; pre-applied so a forged
 * `?filter[]=order_id:eq:N` cannot cross-walk between orders.
 */
export const adminOrderHistoryView = createTableView({
    model: OrderStatusHistory,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        from_status: { type: "string", filterable: true, orderable: false },
        to_status: { type: "string", filterable: true, orderable: false },
        actor_user_id: { type: "bigint", filterable: true, orderable: false },
        occurred_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["occurred_at", "asc"]],
});

export type AdminOrderHistoryViewQuery = InferTableViewQuery<typeof adminOrderHistoryView>;
