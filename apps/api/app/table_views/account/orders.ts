import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import Order from "#models/order";

/**
 * Storefront account orders list view. Customer scoping (`customer_id = <auth>`) and the
 * draft/deleted exclusion stay in the controller — they're security invariants the operator
 * must never be able to bypass via the URL.
 */
export const accountOrdersView = createTableView({
    model: Order,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        order_number: { type: "bigint", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: false },
        grand_total: { type: "bigint", filterable: false, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        date_paid_at: { type: "datetime", filterable: false, orderable: true },
        date_completed_at: { type: "datetime", filterable: false, orderable: true },
    },
    defaultSort: [["id", "desc"]],
});

export type AccountOrdersViewQuery = InferTableViewQuery<typeof accountOrdersView>;
