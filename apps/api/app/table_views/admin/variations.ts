import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductVariation from "#models/product_variation";

/**
 * Admin product-variations list view (sub-resource scoped by `product_id` on the parent
 * route). Soft-deleted rows are filtered out at the controller (`whereNull(deleted_at)`)
 * because bulk delete writes `deleted_at` to preserve order-history references; without that
 * pre-scope, the just-deleted rows would reappear in the next refetch.
 */
export const adminVariationsView = createTableView({
    model: ProductVariation,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        sku: { type: "string", filterable: true, orderable: true },
        regular_price: { type: "bigint", filterable: true, orderable: true },
        sale_price: { type: "bigint", filterable: true, orderable: false },
        menu_order: { type: "number", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["menu_order", "asc"],
        ["id", "asc"],
    ],
});

export type AdminVariationsViewQuery = InferTableViewQuery<typeof adminVariationsView>;
