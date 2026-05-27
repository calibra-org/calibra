import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";

import ProductReview from "#models/product_review";

/**
 * Admin reviews list view. Moderation queue — can grow unbounded, so pagination matters.
 * Changes the response shape from `{ data }` to `{ data, meta }` — a breaking change for any
 * consumer that assumes the flat collection.
 */
export const adminReviewsView = createTableView({
    model: ProductReview,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        product_id: { type: "bigint", filterable: true, orderable: false },
        customer_id: { type: "bigint", filterable: true, orderable: false },
        rating: { type: "number", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: false },
        verified: { type: "boolean", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["created_at", "desc"]],
});

export type AdminReviewsViewQuery = InferTableViewQuery<typeof adminReviewsView>;
