import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductBrand from "#models/product_brand";

/**
 * Admin brands list view. Filterable / orderable per-column dimensions go through TableView;
 * `used_count` is exposed as an orderable column via the primitive's `sortRaw` hook so the
 * ORDER BY targets the `product_brand_links` subquery without forcing the runtime to model a
 * relation join. Default sort is `menu_order asc, id asc` — matches the WordPress / WooCommerce
 * default. The endpoint's `defaultLimit` is 100 so selector / combobox callers default to a
 * page large enough to render the typical full set without forcing them to specify `?limit=`.
 */
export const adminBrandsView = createTableView({
    model: ProductBrand,
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
                `(SELECT COUNT(*) FROM product_brand_links WHERE product_brand_links.brand_id = product_brands.id) ${dir}`,
        },
    },
    defaultSort: [
        ["menu_order", "asc"],
        ["id", "asc"],
    ],
});

export type AdminBrandsViewQuery = InferTableViewQuery<typeof adminBrandsView>;
