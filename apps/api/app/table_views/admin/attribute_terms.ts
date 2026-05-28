import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import ProductAttributeTerm from "#models/product_attribute_term";

/**
 * Admin attribute-terms list view (sub-resource scoped by `attribute_id` on the parent route).
 * The controller pre-scopes the builder before handing off to `view.run` so a forged
 * `?filter[]=attribute_id:eq:N` cannot cross-walk between attributes.
 */
export const adminAttributeTermsView = createTableView({
    model: ProductAttributeTerm,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        menu_order: { type: "number", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["menu_order", "asc"],
        ["id", "asc"],
    ],
});

export type AdminAttributeTermsViewQuery = InferTableViewQuery<typeof adminAttributeTermsView>;
