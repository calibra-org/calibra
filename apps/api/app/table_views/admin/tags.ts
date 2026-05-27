import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductTag from "#models/product_tag";

/**
 * Admin tags list view. Mirrors {@link adminBrandsView} shape; no `menu_order` column on the
 * tags table (WooCommerce never exposed one), so default sort is `id asc`.
 */
export const adminTagsView = createTableView({
    model: ProductTag,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        slug: { type: "string", filterable: true, orderable: true },
        menu_order: { type: "number", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        used_count: {
            type: "number",
            filterable: false,
            orderable: true,
            sortRaw: (dir) =>
                `(SELECT COUNT(*) FROM product_tag_links WHERE product_tag_links.tag_id = product_tags.id) ${dir}`,
        },
    },
    defaultSort: [
        ["menu_order", "asc"],
        ["id", "asc"],
    ],
});

export type AdminTagsViewQuery = InferTableViewQuery<typeof adminTagsView>;
