import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import { ORDER_STATUS_VALUES } from "#enums/order_status";
import Order from "#models/order";

/**
 * Admin orders list view. Filterable + orderable surface for `GET /api/v1/admin/orders`.
 *
 * Soft-delete is the controller's responsibility (the controller appends
 * `whereNull("orders.deleted_at")` or `whereNotNull(...)` to the pre-scoped builder before
 * passing to `view.run()`). Free-text search across multiple columns also stays at the
 * controller level — TableView ops are per-field predicates and don't model an OR-over-N-columns
 * search box.
 */
export const adminOrdersView = createTableView({
    model: Order,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        order_number: { type: "bigint", filterable: true, orderable: true },
        status: {
            type: "enum",
            values: ORDER_STATUS_VALUES as unknown as ReadonlyArray<string>,
            filterable: true,
            orderable: true,
        },
        customer_id: { type: "bigint", filterable: true, orderable: false },
        created_via: { type: "string", filterable: true, orderable: false },
        payment_method_code_snapshot: { type: "string", filterable: true, orderable: false },
        billing_email: { type: "string", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
        updated_at: { type: "datetime", filterable: false, orderable: true },
        grand_total: { type: "bigint", filterable: true, orderable: true },
        date_paid_at: { type: "datetime", filterable: true, orderable: true },
        date_completed_at: { type: "datetime", filterable: true, orderable: true },
        deleted_at: { type: "datetime", filterable: false, orderable: false },
    },
    defaultSort: [
        ["created_at", "desc"],
        ["id", "desc"],
    ],
});

export type AdminOrdersViewQuery = InferTableViewQuery<typeof adminOrdersView>;
