import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import Coupon from "#models/coupon";

/**
 * Admin coupons list view. Simple per-column filters + sort + pagination flow through
 * TableView. The bespoke surface stays controller-side: tab-strip scopes
 * (active/disabled/expired/scheduled — calendar-aware on starts_at/expires_at),
 * `expiring_soon` (7-day horizon), multi-column free-text search (`code` + translation
 * descriptions), `has_*_constraints` existence checks, brand pivot whereIn, and the
 * redemptions_min/max aggregate.
 */
export const adminCouponsView = createTableView({
    model: Coupon,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        code: { type: "string", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: false },
        discount_type: { type: "string", filterable: true, orderable: false },
        amount: { type: "bigint", filterable: true, orderable: true },
        minimum_amount: { type: "bigint", filterable: true, orderable: false },
        maximum_amount: { type: "bigint", filterable: true, orderable: false },
        free_shipping: { type: "boolean", filterable: true, orderable: false },
        individual_use: { type: "boolean", filterable: true, orderable: false },
        exclude_sale_items: { type: "boolean", filterable: true, orderable: false },
        usage_limit: { type: "number", filterable: true, orderable: false },
        usage_limit_per_user: { type: "number", filterable: true, orderable: false },
        starts_at: { type: "datetime", filterable: true, orderable: true },
        expires_at: { type: "datetime", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        updated_at: { type: "datetime", filterable: false, orderable: true },
    },
    defaultSort: [["created_at", "desc"]],
});

export type AdminCouponsViewQuery = InferTableViewQuery<typeof adminCouponsView>;
