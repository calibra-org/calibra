import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import PaymentGateway from "#models/payment_gateway";

/**
 * Admin payment-gateways list view. Tiny dataset (<10 rows by contract). Default sort matches
 * the operator-visible ordering on the settings page.
 */
export const adminPaymentGatewaysView = createTableView({
    model: PaymentGateway,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        code: { type: "string", filterable: true, orderable: true },
        enabled: { type: "boolean", filterable: true, orderable: true },
        ordering: { type: "number", filterable: true, orderable: true },
    },
    defaultSort: [
        ["ordering", "asc"],
        ["id", "asc"],
    ],
});

export type AdminPaymentGatewaysViewQuery = InferTableViewQuery<typeof adminPaymentGatewaysView>;
