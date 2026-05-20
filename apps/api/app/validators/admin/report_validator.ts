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
