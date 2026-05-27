import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductCategory from "#models/product_category";

/**
 * Admin categories list view. Mirrors {@link adminBrandsView} shape with the addition of a
 * `parent_id` filterable column for hierarchy slicing (the FE uses
 * `?filter[]=parent_id:isnull` to list top-level rows or `?filter[]=parent_id:eq:N` for one
 * level of children).
 */
export const adminCategoriesView = createTableView({
    model: ProductCategory,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        slug: { type: "string", filterable: true, orderable: true },
        parent_id: { type: "bigint", filterable: true, orderable: false },
        menu_order: { type: "number", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        used_count: {
            type: "number",
            filterable: false,
            orderable: true,
            sortRaw: (dir) =>
                `(SELECT COUNT(*) FROM product_category_links WHERE product_category_links.category_id = product_categories.id) ${dir}`,
        },
    },
    defaultSort: [
        ["menu_order", "asc"],
        ["id", "asc"],
    ],
});

export type AdminCategoriesViewQuery = InferTableViewQuery<typeof adminCategoriesView>;
