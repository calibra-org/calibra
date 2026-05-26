import { type ScaleQuantile, scaleQuantile } from "d3-scale";
import { schemePurples, schemeReds } from "d3-scale-chromatic";

/**
 * ColorBrewer-style six-bin sequential single-hue choropleth scale, driven by `d3-scale`'s
 * quantile partition. Quantile binning suits Iranian order distributions because they're
 * heavy-tailed (Tehran absorbs ~30% of any dataset) — equal-interval would collapse 30 of the
 * 31 provinces into the lightest bin and leave the map unreadable.
 *
 * Zero is a distinct category (gray-100), so absent-data provinces never collide with the
 * palette floor. Orders use Purples + Revenue uses Reds — both stay distinct from the dark-blue
 * sea fill so a quick glance never confuses water for a heat-map bin.
 */

export type HeatmapMetric = "orders" | "revenue";

export const ZERO_COLOR = "#f3f4f6";

const PALETTES: Record<HeatmapMetric, readonly string[]> = {
    orders: schemePurples[6],
    revenue: schemeReds[6],
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
