import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductShippingClass from "#models/product_shipping_class";

/**
 * Admin shipping-classes list view. Same shape as the other taxonomies.
 */
export const adminShippingClassesView = createTableView({
    model: ProductShippingClass,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        slug: { type: "string", filterable: true, orderable: true },
        menu_order: { type: "number", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["menu_order", "asc"],
        ["id", "asc"],
    ],
});

export type AdminShippingClassesViewQuery = InferTableViewQuery<typeof adminShippingClassesView>;
