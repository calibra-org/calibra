import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import OrderStatusHistory from "#models/order_status_history";

/**
 * Account-side order-history list view. Same columns as the admin sibling, but the
 * `forCustomer` transformer variant drops `actor_user_id` + free-text `reason`. Authorisation
 * is the `viewOrder` ability against the parent order — pre-applied in the controller — so a
 * forged `?filter[]=order_id:eq:N` cannot cross-walk between tenants.
 */
export const accountOrderHistoryView = createTableView({
    model: OrderStatusHistory,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        from_status: { type: "string", filterable: true, orderable: false },
        to_status: { type: "string", filterable: true, orderable: false },
        occurred_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["occurred_at", "asc"]],
});

export type AccountOrderHistoryViewQuery = InferTableViewQuery<typeof accountOrderHistoryView>;
