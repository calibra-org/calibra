import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import TaxClass from "#models/tax_class";

/**
 * Admin tax-classes list view. Tiny dataset (<20 rows by convention); migrating to TableView
 * keeps the wire grammar uniform across every list endpoint even though the operator never
 * needs to paginate it in practice.
 */
export const adminTaxClassesView = createTableView({
    model: TaxClass,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        name: { type: "string", filterable: true, orderable: true },
        slug: { type: "string", filterable: true, orderable: true },
    },
    defaultSort: [
        ["name", "asc"],
        ["id", "asc"],
    ],
});

export type AdminTaxClassesViewQuery = InferTableViewQuery<typeof adminTaxClassesView>;
