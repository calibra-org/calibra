import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import PaymentAttempt from "#models/payment_attempt";

/**
 * Admin payment-attempts list view. All filter dimensions (gateway, status, order_id, date
 * window) map cleanly onto TableView ops — no bespoke joins or aggregates.
 */
export const adminPaymentAttemptsView = createTableView({
    model: PaymentAttempt,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        order_id: { type: "bigint", filterable: true, orderable: false },
        gateway_id: { type: "bigint", filterable: true, orderable: false },
        gateway_code_snapshot: { type: "string", filterable: true, orderable: false },
        status: { type: "string", filterable: true, orderable: true },
        amount_minor: { type: "bigint", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        initiated_at: { type: "datetime", filterable: true, orderable: true },
        verified_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "desc"]],
});

export type AdminPaymentAttemptsViewQuery = InferTableViewQuery<typeof adminPaymentAttemptsView>;
