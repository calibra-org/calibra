import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import Product from "#models/product";

/**
 * Admin products list view. Per-column filters and sort go through TableView; everything
 * relational (category/brand/tag pivots), aggregate (stock_level having clauses), or compound
 * (free-text search across translations+sku, facet_counts response shape, on-sale window
 * derived from sale_starts_at/sale_ends_at, has_image existence check) stays as top-level
 * controller-side predicates.
 *
 * The `name` and `stock_quantity` sort cases target joined tables (translations + the
 * inventory_items aggregate). They opt into the primitive's `sortRaw` hook so the ORDER BY
 * fragment can target a subquery without forcing the view to model a relation.
 */
export const adminProductsView = createTableView({
    model: Product,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        sku: { type: "string", filterable: true, orderable: true },
        gtin: { type: "string", filterable: true, orderable: false },
        type: { type: "string", filterable: true, orderable: false },
        status: { type: "string", filterable: true, orderable: false },
        catalog_visibility: { type: "string", filterable: true, orderable: false },
        featured: { type: "boolean", filterable: true, orderable: false },
        virtual: { type: "boolean", filterable: true, orderable: false },
        downloadable: { type: "boolean", filterable: true, orderable: false },
        regular_price: { type: "bigint", filterable: true, orderable: true },
        sale_price: { type: "bigint", filterable: true, orderable: false },
        tax_class_id: { type: "bigint", filterable: true, orderable: false },
        menu_order: { type: "number", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        updated_at: { type: "datetime", filterable: false, orderable: true },
        name: {
            type: "string",
            filterable: false,
            orderable: true,
            sortRaw: (dir) =>
                `(SELECT MIN(name) FROM product_translations WHERE product_translations.product_id = products.id) ${dir}`,
        },
        stock_quantity: {
            type: "number",
            filterable: false,
            orderable: true,
            sortRaw: (dir) =>
                `(SELECT COALESCE(SUM(stock_quantity), 0) FROM inventory_items WHERE inventory_items.product_id = products.id) ${dir}`,
        },
    },
    defaultSort: [["id", "desc"]],
});

export type AdminProductsViewQuery = InferTableViewQuery<typeof adminProductsView>;
