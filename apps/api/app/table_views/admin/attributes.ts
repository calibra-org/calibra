import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductAttribute from "#models/product_attribute";

/**
 * Admin attributes list view. Small dataset (tens of rows in practice); `defaultLimit` is the
 * usual 100 so consumers that just want the full set don't have to specify `?limit=`.
 */
export const adminAttributesView = createTableView({
    model: ProductAttribute,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        code: { type: "string", filterable: true, orderable: true },
        order_by: { type: "string", filterable: true, orderable: false },
        has_archives: { type: "boolean", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "asc"]],
});

export type AdminAttributesViewQuery = InferTableViewQuery<typeof adminAttributesView>;
