"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalCountry } from "#/lib/types";

import { buildHeatmapScale, type HeatmapMetric, metricValue } from "./heatmap-scale";
import { KpiTile } from "./kpi-tile";
import { MapLegend } from "./map-legend";
import { MapSvg } from "./map-svg";
import { MapTooltip } from "./map-tooltip";
import { MapZoomWrapper } from "./map-zoom-wrapper";
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
        const map = new Map<string, { orders: number; revenue: number; customers: number; name: { fa: string; en: string } }>();
        if (!data) return map;
        for (const row of data.rows) {
            map.set(row.code, {
                orders: row.ordersCount,
                revenue: row.revenueMinor,
                customers: row.customersCount,
                name: row.name,
            });
        }
        return map;
    }, [data]);

    const scale = useMemo(() => {
        if (!data) return buildHeatmapScale([], metric);
        const values = data.rows.map((r) => metricValue(r, metric));
        return buildHeatmapScale(values, metric);
    }, [data, metric]);

    const fillForCode = (code: string) => {
        const row = valuesByCode.get(code);
        if (!row) return scale.fillFor(0);
        return scale.fillFor(
            metricValue({ ordersCount: row.orders, revenueMinor: row.revenue, customersCount: row.customers }, metric),
        );
    };

    const hovered = hoveredCode ? valuesByCode.get(hoveredCode) : null;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    label={t("totalCustomers")}
                    value={data?.totals.customersCount ?? 0}
                    formatAs="number"
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                />
            </div>

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
                <motion.div
                    key="country"
                    variants={svgVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: SVG_CROSSFADE_DURATION }}
                    className="relative xl:col-span-2"
                >
                    {isPending ? (
                        <Skeleton className="h-[500px] w-full" />
                    ) : (
                        <MapZoomWrapper className="h-[500px]">
                            <MapSvg
                                fillForCode={fillForCode}
                                hoveredCode={hoveredCode}
                                onHoverChange={setHoveredCode}
                                onPointerMove={(event) => setPointer({ x: event.clientX, y: event.clientY })}
                                onSelect={onSelect}
                                locale={locale}
                            />
                        </MapZoomWrapper>
                    )}
                </motion.div>

                <div className="flex h-[500px] flex-col gap-3">
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
                        <span className="text-muted-foreground">
                            {t("totalCustomers")}: {formatNumber(hovered.customers, locale)}
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
    const rows = [...data.rows].sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
    const max = Math.max(...rows.map((r) => metricValue(r, metric)), 1);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            <ScrollArea className="h-full">
                <motion.ul className="flex flex-col gap-2 p-3" variants={listVariants} initial="hidden" animate="show">
                    {rows.map((row) => {
                        const value = metricValue(row, metric);
                        const percent = (value / max) * 100;
                        const formatted = metric === "revenue" ? formatMoney(value, locale) : formatNumber(value, locale);
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
