import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import OrderNote from "#models/order_note";

/**
 * Account-side order-notes list view. The controller pre-applies
 * `where('visibility', 'customer')` as a security invariant — operator-facing internal notes
 * must never leak through this endpoint, regardless of the wire `filter[]`.
 */
export const accountOrderNotesView = createTableView({
    model: OrderNote,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "desc"]],
});

export type AccountOrderNotesViewQuery = InferTableViewQuery<typeof accountOrderNotesView>;
