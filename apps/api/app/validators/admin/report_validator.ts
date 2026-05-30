import vine from "@vinejs/vine";

/**
 * Query parameters for `GET /api/v1/admin/reports/top-products`. `days` is bounded so a careless
 * caller can't ask for a five-year window; `limit` caps how many rows we return.
 */
export const adminTopProductsValidator = vine.compile(
    vine.object({
        days: vine.number().min(1).max(365).optional(),
        limit: vine.number().min(1).max(50).optional(),
    }),
);

/** `GET /api/v1/admin/reports/top-categories` — same trailing-window contract as top-products. */
export const adminTopCategoriesValidator = adminTopProductsValidator;

/**
 * Shared query contract for every windowed analytics endpoint (performance + the `*​/stats`
 * family). `date_from` / `date_to` are inclusive Gregorian bounds the admin date-picker resolves;
 * `interval` overrides the auto-picked bucket granularity; `compare_from` / `compare_to` request a
 * parallel comparison window (both required together, enforced in the controller).
 */
export const adminReportStatsValidator = vine.compile(
    vine.object({
        date_from: vine.string().trim().maxLength(40),
        date_to: vine.string().trim().maxLength(40),
        interval: vine.enum(["day", "week", "month"]).optional(),
        compare_from: vine.string().trim().maxLength(40).optional(),
        compare_to: vine.string().trim().maxLength(40).optional(),
    }),
);

/**
 * Query contract for the custom report TABLE endpoints (revenue / orders / products / categories /
 * coupons / taxes). These are GROUP BY aggregations, not entity lists, so they take a flat sort +
 * pagination contract rather than the TableView grammar. `format=csv` streams the full windowed
 * result as a download.
 */
export const adminReportTableValidator = vine.compile(
    vine.object({
        date_from: vine.string().trim().maxLength(40),
        date_to: vine.string().trim().maxLength(40),
        interval: vine.enum(["day", "week", "month"]).optional(),
        order_by: vine.string().trim().maxLength(40).optional(),
        order_dir: vine.enum(["asc", "desc"]).optional(),
        page: vine.number().min(1).optional(),
        limit: vine.number().min(1).max(200).optional(),
        format: vine.enum(["csv"]).optional(),
        q: vine.string().trim().maxLength(120).optional(),
        category_id: vine.number().min(1).optional(),
    }),
);

/**
 * Stock report query contract. The Stock report is a current snapshot with no date dimension, so it
 * drops `date_from` / `date_to` and adds the `status` filter (including the derived `lowstock`).
 */
export const adminStockReportValidator = vine.compile(
    vine.object({
        status: vine.enum(["all", "instock", "outofstock", "onbackorder", "lowstock"]).optional(),
        q: vine.string().trim().maxLength(120).optional(),
        order_by: vine.string().trim().maxLength(40).optional(),
        order_dir: vine.enum(["asc", "desc"]).optional(),
        page: vine.number().min(1).optional(),
        limit: vine.number().min(1).max(200).optional(),
        format: vine.enum(["csv"]).optional(),
    }),
);
