import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import CustomerSegment from "#models/customer_segment";

/**
 * Admin customer-segments list view. Per-user saved searches; the owner-scope
 * (`where('user_id', auth.id)`) is pre-applied at the controller as a security invariant —
 * not via the view, because a forged `?filter[]=user_id:eq:N` would otherwise let one operator
 * read another's saved segments.
 */
export const adminCustomerSegmentsView = createTableView({
    model: CustomerSegment,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        name: { type: "string", filterable: true, orderable: true },
        is_pinned: { type: "boolean", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        last_used_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["is_pinned", "desc"],
        ["name", "asc"],
    ],
});

export type AdminCustomerSegmentsViewQuery = InferTableViewQuery<typeof adminCustomerSegmentsView>;
