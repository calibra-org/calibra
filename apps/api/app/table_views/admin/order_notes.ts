import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import OrderNote from "#models/order_note";

/**
 * Admin order-notes list view. Sub-resource scoped by `order_id` in the controller. The
 * legacy `?type=any|customer|internal` keyword stays as a top-level alias for what is now
 * `filter[]=visibility:eq:customer` / `:eq:internal`; the alias is exposed so the existing
 * admin UI doesn't need a wire refactor in this PR.
 */
export const adminOrderNotesView = createTableView({
    model: OrderNote,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        visibility: { type: "string", filterable: true, orderable: false },
        author_user_id: { type: "bigint", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "desc"]],
});

export type AdminOrderNotesViewQuery = InferTableViewQuery<typeof adminOrderNotesView>;
