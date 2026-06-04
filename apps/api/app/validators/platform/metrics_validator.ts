import vine from "@vinejs/vine";

/** Range tokens the metrics endpoint accepts; the controller maps each to a from/to + bucket unit. */
export const METRICS_RANGES = ["7d", "30d", "90d", "12m"] as const;
export type MetricsRange = (typeof METRICS_RANGES)[number];

/**
 * Per-tenant metrics query. `range` picks the window; `unit` optionally overrides the series
 * bucket (defaults: daily for `7d`/`30d`, weekly for `90d`, monthly for `12m`).
 */
export const metricsQueryValidator = vine.compile(
    vine.object({
        range: vine.enum(METRICS_RANGES).optional(),
        unit: vine.enum(["day", "week", "month"] as const).optional(),
    }),
);
