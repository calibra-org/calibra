import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import CustomerNote from "#models/customer_note";

/**
 * Admin customer-notes list view (sub-resource scoped by `customer_id` on the parent route).
 * Customer-id scope is the authorisation surface; pre-applied so a forged
 * `?filter[]=customer_id:eq:N` cannot cross-walk between customers.
 */
export const adminCustomerNotesView = createTableView({
    model: CustomerNote,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        author_user_id: { type: "bigint", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["created_at", "desc"]],
});

export type AdminCustomerNotesViewQuery = InferTableViewQuery<typeof adminCustomerNotesView>;
