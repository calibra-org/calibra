import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import CustomerAddress from "#models/customer_address";

/**
 * Account-side addresses list view. The customer-scope (`where('customer_id', auth.customer.id)`)
 * is pre-applied at the controller as a security invariant; a forged
 * `?filter[]=customer_id:eq:N` cannot read another customer's addresses.
 */
export const accountAddressesView = createTableView({
    model: CustomerAddress,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        kind: { type: "string", filterable: true, orderable: true },
        country: { type: "string", filterable: true, orderable: true },
        city: { type: "string", filterable: true, orderable: true },
        is_default: { type: "boolean", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "asc"]],
});

export type AccountAddressesViewQuery = InferTableViewQuery<typeof accountAddressesView>;
