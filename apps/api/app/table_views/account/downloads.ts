import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import CustomerDownload from "#models/customer_download";

/**
 * Account-side downloads list view. Two security invariants stay controller-side: the
 * customer-scope (`where('customer_id', auth.customer.id)`) and the active-grant predicate
 * (`expires_at IS NULL OR expires_at > now()`). Both are pre-applied on the builder so the
 * wire `filter[]` can't ever surface expired or cross-tenant grants.
 */
export const accountDownloadsView = createTableView({
    model: CustomerDownload,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        product_id: { type: "bigint", filterable: true, orderable: false },
        granted_at: { type: "datetime", filterable: true, orderable: true },
        expires_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["granted_at", "desc"]],
});

export type AccountDownloadsViewQuery = InferTableViewQuery<typeof accountDownloadsView>;
