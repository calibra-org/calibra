"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { formatMoney, formatNumber } from "#/lib/format";

import { type HeatmapMetric, type HeatmapScale, ZERO_COLOR } from "./heatmap-scale";

interface MapLegendProps {
    scale: HeatmapScale;
    metric: HeatmapMetric;
    locale: Locale;
}

/**
 * Six-swatch quantile legend for the heatmap. Hides numeric labels when the dataset is empty
 * (no non-zero values) — the country view then renders a single "no orders" overlay instead.
 */
export function MapLegend({ scale, metric, locale }: MapLegendProps) {
    const t = useTranslations("Dashboard.regional");
    const formatValue = metric === "revenue" ? (v: number) => formatMoney(v, locale) : (v: number) => formatNumber(v, locale);

    return (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground">
            <h4 className="font-medium text-xs">{t("legendTitle")}</h4>
            {scale.bands.length === 0 ? (
                <div className="flex items-center gap-2">
                    <span className="block size-4 rounded-sm" style={{ backgroundColor: ZERO_COLOR }} />
                    <span className="text-muted-foreground text-xs">{t("empty")}</span>
                </div>
            ) : (
                <ul className="flex flex-col gap-1">
                    {scale.bands.map((band, i) => (
                        <li key={`band-${i.toString()}`} className="flex items-center gap-2 text-xs">
                            <span className="block size-4 rounded-sm" style={{ backgroundColor: band.color }} />
                            <span className="text-muted-foreground tabular-nums">
                                {formatValue(band.from)} – {formatValue(band.to)}
                            </span>
                        </li>
                    ))}
                    <li className="mt-1 flex items-center gap-2 text-xs">
                        <span className="block size-4 rounded-sm" style={{ backgroundColor: ZERO_COLOR }} />
                        <span className="text-muted-foreground">{t("emptyProvince")}</span>
                    </li>
                </ul>
            )}
        </div>
    );
}
