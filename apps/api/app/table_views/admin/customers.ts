import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import Customer from "#models/customer";

/**
 * Admin customers list view — exposes the **simple per-column** filter / sort surface as
 * TableView. Tabs, free-text search, tag joins, marketing-pref joins, has_national_id existence
 * checks, with_orders aggregate filters, and `include_stats` response shape all stay as
 * top-level wire params on the validator (they can't be modeled as per-field predicates without
 * leaking aggregate / having-clause semantics into the runtime).
 *
 * Soft-delete remains controller-side (`whereNull("customers.deleted_at")` for live, flipped for
 * `tab=trashed`).
 */
export const adminCustomersView = createTableView({
    model: Customer,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        first_name: { type: "string", filterable: true, orderable: true },
        last_name: { type: "string", filterable: true, orderable: true },
        is_paying_customer: { type: "boolean", filterable: true, orderable: false },
        country_default: { type: "string", filterable: true, orderable: false },
        status: { type: "string", filterable: true, orderable: false },
        acquisition_channel: { type: "string", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
        updated_at: { type: "datetime", filterable: false, orderable: true },
        user_id: { type: "bigint", filterable: true, orderable: false },
    },
    defaultSort: [
        ["created_at", "desc"],
        ["id", "desc"],
    ],
});

export type AdminCustomersViewQuery = InferTableViewQuery<typeof adminCustomersView>;
