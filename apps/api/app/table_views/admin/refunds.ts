import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import OrderRefund from "#models/order_refund";

/**
 * Admin refunds list view. Sub-resource scoped by `order_id` — the controller enforces
 * `where("order_id", parent)` before passing the pre-scoped builder to `view.run`. The view's
 * filterable surface is small because the refunds table is small per-order; the operator's
 * UI mostly paginates and sorts.
 */
export const adminRefundsView = createTableView({
    model: OrderRefund,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        amount_total: { type: "bigint", filterable: true, orderable: true },
        reason: { type: "string", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "desc"]],
});

export type AdminRefundsViewQuery = InferTableViewQuery<typeof adminRefundsView>;
