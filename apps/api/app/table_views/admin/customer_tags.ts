import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import CustomerTag from "#models/customer_tag";

/**
 * Admin customer-tags list. The `q` prefix-search remains a top-level alias for the autocomplete
 * combobox UX (the FE wants prefix not substring); the rest moves to TableView.
 */
export const adminCustomerTagsView = createTableView({
    model: CustomerTag,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        name: { type: "string", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["name", "asc"]],
});

export type AdminCustomerTagsViewQuery = InferTableViewQuery<typeof adminCustomerTagsView>;
