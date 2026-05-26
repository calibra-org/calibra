"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalCountry } from "#/lib/types";

import { buildHeatmapScale, type HeatmapMetric } from "./heatmap-scale";
import { KpiTile } from "./kpi-tile";
import { MapLegend } from "./map-legend";
import { MapSvg } from "./map-svg";
import { MapTooltip } from "./map-tooltip";
import { itemVariants, listVariants, SVG_CROSSFADE_DURATION, svgVariants } from "./motion-variants";

interface CountryViewProps {
    data: AdminRegionalCountry | undefined;
    isPending: boolean;
    isError: boolean;
    metric: HeatmapMetric;
    onSelect: (code: string) => void;
    locale: Locale;
}

/**
 * Country-mode panel: SVG + quantile legend + top-province list. The clicked province path is
 * the source side of the `layoutId="region-<code>"` morph; the side-panel silhouette in
 * `<ProvinceView>` provides the destination.
 */
export function CountryView({ data, isPending, isError, metric, onSelect, locale }: CountryViewProps) {
    const t = useTranslations("Dashboard.regional");
    const [hoveredCode, setHoveredCode] = useState<string | null>(null);
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

    const valuesByCode = useMemo(() => {
        const map = new Map<string, { orders: number; revenue: number; name: { fa: string; en: string } }>();
        if (!data) return map;
        for (const row of data.rows) {
            map.set(row.code, { orders: row.ordersCount, revenue: row.revenueMinor, name: row.name });
        }
        return map;
    }, [data]);

    const scale = useMemo(() => {
        if (!data) return buildHeatmapScale([], metric);
        const values = data.rows.map((r) => (metric === "revenue" ? r.revenueMinor : r.ordersCount));
        return buildHeatmapScale(values, metric);
    }, [data, metric]);

    const fillForCode = (code: string) => {
        const row = valuesByCode.get(code);
        const value = row ? (metric === "revenue" ? row.revenue : row.orders) : 0;
        return scale.fillFor(value);
    };

    const hovered = hoveredCode ? valuesByCode.get(hoveredCode) : null;
    const topProvince = useMemo(() => {
        if (!data) return null;
        const sorted = [...data.rows].sort((a, b) =>
            metric === "revenue" ? b.revenueMinor - a.revenueMinor : b.ordersCount - a.ordersCount,
        );
        return sorted[0] ?? null;
    }, [data, metric]);

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiTile
                    label={t("totalOrders")}
                    value={data?.totals.ordersCount ?? 0}
                    formatAs="number"
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                />
                <KpiTile
                    label={t("totalRevenue")}
                    value={data?.totals.revenueMinor ?? 0}
                    formatAs="money"
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                />
                <KpiTile
                    label={t("topProvince")}
                    value={topProvince ? (metric === "revenue" ? topProvince.revenueMinor : topProvince.ordersCount) : 0}
                    formatAs={metric === "revenue" ? "money" : "number"}
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                    sublabel={topProvince?.name[locale]}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
                <motion.div
                    key="country"
                    variants={svgVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: SVG_CROSSFADE_DURATION }}
                    className="relative"
                >
                    {isPending ? (
                        <Skeleton className="aspect-square w-full" />
                    ) : (
                        <MapSvg
                            fillForCode={fillForCode}
                            hoveredCode={hoveredCode}
                            onHoverChange={setHoveredCode}
                            onPointerMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
                            onSelect={onSelect}
                        />
                    )}
                </motion.div>

                <div className="flex flex-col gap-3">
                    <MapLegend scale={scale} metric={metric} locale={locale} />
                    <TopProvinceList data={data} metric={metric} locale={locale} onSelect={onSelect} />
                </div>
            </div>

            {hovered && pointer ? (
                <MapTooltip position={pointer}>
                    <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{hovered.name[locale]}</span>
                        <span className="text-muted-foreground">
                            {t("totalOrders")}: {formatNumber(hovered.orders, locale)}
                        </span>
                        <span className="text-muted-foreground">
                            {t("totalRevenue")}: {formatMoney(hovered.revenue, locale)}
                        </span>
                        <span className="text-muted-foreground italic">{t("tooltipHint")}</span>
                    </div>
                </MapTooltip>
            ) : null}
        </div>
    );
}

function TopProvinceList({
    data,
    metric,
    locale,
    onSelect,
}: {
    data: AdminRegionalCountry | undefined;
    metric: HeatmapMetric;
    locale: Locale;
    onSelect: (code: string) => void;
}) {
    if (!data) return null;
    const rows = [...data.rows].sort((a, b) =>
        metric === "revenue" ? b.revenueMinor - a.revenueMinor : b.ordersCount - a.ordersCount,
    );
    const max =
        metric === "revenue" ? Math.max(...rows.map((r) => r.revenueMinor), 1) : Math.max(...rows.map((r) => r.ordersCount), 1);

    return (
        <div className="rounded-lg border bg-card">
            <ScrollArea className="h-80">
                <motion.ul className="flex flex-col gap-2 p-3" variants={listVariants} initial="hidden" animate="show">
                    {rows.map((row) => {
                        const value = metric === "revenue" ? row.revenueMinor : row.ordersCount;
                        const percent = (value / max) * 100;
                        const formatted =
                            metric === "revenue" ? formatMoney(row.revenueMinor, locale) : formatNumber(row.ordersCount, locale);
                        return (
                            <motion.li
                                key={row.code}
                                variants={itemVariants}
                                className="flex cursor-pointer flex-col gap-1 rounded p-1.5 transition-colors hover:bg-accent"
                                onClick={() => onSelect(row.code)}
                            >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate font-medium">{row.name[locale]}</span>
                                    <span className="shrink-0 tabular-nums">{formatted}</span>
                                </div>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                    <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                                </div>
                            </motion.li>
                        );
                    })}
                </motion.ul>
            </ScrollArea>
        </div>
    );
}
