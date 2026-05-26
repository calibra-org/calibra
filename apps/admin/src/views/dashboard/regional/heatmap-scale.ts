import { type ScaleQuantile, scaleQuantile } from "d3-scale";

/**
 * Single-hue (shades) choropleth palettes, partitioned via `scaleQuantile` so heavy-tailed
 * order distributions still read cleanly (Tehran absorbs ~30% of any dataset; equal-interval
 * bins would collapse 30 of 31 provinces into the lightest stop).
 *
 * Palettes start at the Tailwind 300 stop instead of 100/200 — the very light stops vanish on
 * a dark card background, and the very dark stops (900+) vanish on a light card background. The
 * 300→900 range stays visible across both modes without per-theme branching.
 *
 *   - **Orders → Emerald shades** — saturated green ramp, vivid against both light and dark
 *     cards, distinct from the dark-blue sea.
 *   - **Revenue → Rose shades** — warm red/pink ramp, reads as "hotter = more" without the
 *     low-luminance washout of pure red at the dark end.
 *   - **Customers → Blue shades** — cool blue ramp, distinct hue from both green orders and
 *     red revenue so a glance at the legend tells the operator which metric is active. Starts
 *     at Tailwind `blue-300` (`#93c5fd`) — saturated enough to read against the cyan sea
 *     (`#7bdaff`) without colliding, and the dark stops stay legible on light backgrounds.
 *
 * Zero is a distinct category (`#94a3b8` slate-400, mid-luminance) so absent-data regions
 * never collide with the palette floor on either theme. The WCAG contrast pass picks white
 * text on it under either mode (luminance ≈ 0.36, below the 0.4 threshold).
 */

export type HeatmapMetric = "orders" | "revenue" | "customers";

export const ZERO_COLOR = "#94a3b8";

const EMERALD: readonly string[] = ["#6ee7b7", "#34d399", "#10b981", "#059669", "#047857", "#065f46", "#064e3b"];

const ROSE: readonly string[] = ["#fda4af", "#fb7185", "#f43f5e", "#e11d48", "#be123c", "#9f1239", "#881337"];

const BLUE: readonly string[] = ["#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a"];

const PALETTES: Record<HeatmapMetric, readonly string[]> = {
    orders: EMERALD,
    revenue: ROSE,
    customers: BLUE,
};

export interface HeatmapScale {
    fillFor: (value: number) => string;
    bands: ReadonlyArray<{ from: number; to: number; color: string }>;
}

interface MetricSource {
    ordersCount: number;
    revenueMinor: number;
    customersCount: number;
}

/**
 * Pick the active metric's numeric value off a row. Three-branch decision table lives here so
 * the views can keep using a single 2-level ternary at the format edge (`revenue → money, else
 * → number`) instead of nesting selectors against the metric union.
 */
export function metricValue(row: MetricSource, metric: HeatmapMetric): number {
    if (metric === "revenue") return row.revenueMinor;
    if (metric === "customers") return row.customersCount;
    return row.ordersCount;
}

const EMPTY_BANDS: ReadonlyArray<{ from: number; to: number; color: string }> = [];

/**
 * Build a quantile scale over the non-zero values. Returns a constant zero-paint when no
 * non-zero values exist — the caller renders the legend as "no orders" in that case.
 */
export function buildHeatmapScale(values: ReadonlyArray<number>, metric: HeatmapMetric): HeatmapScale {
    const palette = PALETTES[metric];
    const nonZero = values.filter((v) => v > 0);
    if (nonZero.length === 0) {
        return {
            fillFor: () => ZERO_COLOR,
            bands: EMPTY_BANDS,
        };
    }
    const scale: ScaleQuantile<string> = scaleQuantile<string>().domain(nonZero).range(palette);
    const cuts = scale.quantiles();
    const min = Math.min(...nonZero);
    const max = Math.max(...nonZero);
    const bands = palette.map((color, index) => {
        const from = index === 0 ? min : (cuts[index - 1] ?? min);
        const to = index === palette.length - 1 ? max : (cuts[index] ?? max);
        return { from, to, color };
    });
    return {
        fillFor: (value) => (value <= 0 ? ZERO_COLOR : scale(value)),
        bands,
    };
}
