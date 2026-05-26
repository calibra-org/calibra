import vine from "@vinejs/vine";

/**
 * Query parameters for `GET /api/v1/admin/insights/regional/provinces`.
 *
 * `from` / `to` are optional ISO datetimes (Gregorian) — when omitted, the controller defaults
 * to the trailing 30 days. `metric` is informational; both endpoints always return BOTH
 * orders + revenue per row, but including it in the cache key keeps each metric mode's slot
 * separate when the SDK consumer prefers it.
 */
export const adminRegionalProvincesValidator = vine.compile(
    vine.object({
        from: vine.date({ formats: { utc: true } }).optional(),
        to: vine.date({ formats: { utc: true } }).optional(),
        metric: vine.enum(["orders", "revenue", "customers"]).optional(),
    }),
);

/**
 * Query parameters for `GET /api/v1/admin/insights/regional/provinces/:code`. Same `from`/`to`
 * window plus a `top_products` cap (1–10, default 5) so the side-panel respects the operator's
 * settings without re-issuing the request when only the cap changes.
 */
export const adminRegionalProvinceValidator = vine.compile(
    vine.object({
        from: vine.date({ formats: { utc: true } }).optional(),
        to: vine.date({ formats: { utc: true } }).optional(),
        top_products: vine.number().min(1).max(10).optional(),
    }),
);

/** Path param for `:code` — strict ISO-3166-2:IR-NN format. */
export const adminRegionalProvinceCodeValidator = vine.compile(
    vine.object({
        code: vine.string().regex(/^IR-(0[1-9]|[12][0-9]|3[01])$/),
    }),
);
