import { type ScaleQuantile, scaleQuantile } from "d3-scale";
import { interpolateInferno, interpolateViridis } from "d3-scale-chromatic";

/** Local `quantize` so we don't pull `d3-interpolate` into the catalog just for this. */
function quantize(interpolator: (t: number) => string, n: number): string[] {
    if (n < 1) return [];
    if (n === 1) return [interpolator(0.5)];
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) out.push(interpolator(i / (n - 1)));
    return out;
}

/**
 * Perceptually-uniform multi-hue choropleth palettes, sampled at 7 stops and partitioned via
 * `scaleQuantile` so heavy-tailed order distributions still read cleanly (Tehran absorbs ~30%
 * of any dataset; equal-interval bins would collapse 30 of 31 provinces into the lightest stop).
 *
 * Both palettes are scientific colour maps in the spirit of the GMT / Fabio Crameri Scientific
 * Colour Maps reference (`https://docs.generic-mapping-tools.org/dev/reference/cpts.html`):
 *
 *   - **Orders → Viridis** — purple → teal → green → yellow. Perceptually uniform, colour-blind
 *     safe, monotonic in luminance. No blue overlap with the dark-blue sea.
 *   - **Revenue → Inferno** — black → purple → red → orange → yellow. Heat-style, intuitive
 *     for "more = hotter", monotonic in luminance, colour-blind safe.
 *
 * Zero is a distinct category (`#f3f4f6`) so absent-data provinces never collide with the
 * palette floor.
 */

export type HeatmapMetric = "orders" | "revenue";

export const ZERO_COLOR = "#f3f4f6";

const STOPS = 7;

const PALETTES: Record<HeatmapMetric, readonly string[]> = {
    orders: quantize(interpolateViridis, STOPS),
    revenue: quantize(interpolateInferno, STOPS),
};

export interface HeatmapScale {
    fillFor: (value: number) => string;
    bands: ReadonlyArray<{ from: number; to: number; color: string }>;
}

const EMPTY_BANDS: ReadonlyArray<{ from: number; to: number; color: string }> = [];

/**
 * Build a quantile scale over the non-zero values. Returns `null`-equivalent (every value paints
 * the zero color) when the input is empty — the caller renders the legend as "no orders" in that
 * case.
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
