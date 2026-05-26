"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalCounty, AdminRegionalProvinceDetail } from "#/lib/types";

import { CountyList } from "./county-list";
import { buildHeatmapScale, type HeatmapMetric } from "./heatmap-scale";
import { KpiTile } from "./kpi-tile";
import { MapLegend } from "./map-legend";
import { MapTooltip } from "./map-tooltip";
import { MapZoomWrapper } from "./map-zoom-wrapper";
import { SVG_CROSSFADE_DURATION, svgVariants } from "./motion-variants";
import { ProvinceSvg } from "./province-svg";
import { TopProductsList } from "./top-products-list";

interface ProvinceViewProps {
    code: string;
    data: AdminRegionalProvinceDetail | undefined;
    isPending: boolean;
    isError: boolean;
    metric: HeatmapMetric;
    onBack: () => void;
    locale: Locale;
}

/**
 * Province-mode panel: a large highlighted silhouette of the selected province (the destination
 * side of the country↔province `layoutId` morph), three KPI tiles, a top-products list, and the
 * top-cities mini-list with seeded/unmatched flagging.
 */
export function ProvinceView({ code, data, isPending, isError, metric, onBack, locale }: ProvinceViewProps) {
    const t = useTranslations("Dashboard.regional");
    const tCommon = useTranslations("Common");
    const reduce = useReducedMotion();

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onBack();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onBack]);

    const topCounty =
        data?.counties && data.counties.length > 0
            ? [...data.counties].sort((a, b) =>
                  metric === "revenue" ? b.revenueMinor - a.revenueMinor : b.ordersCount - a.ordersCount,
              )[0]
            : null;

    const scale = useMemo(() => {
        if (!data) return buildHeatmapScale([], metric);
        const values = data.counties.map((c) => (metric === "revenue" ? c.revenueMinor : c.ordersCount));
        return buildHeatmapScale(values, metric);
    }, [data, metric]);

    const [hoveredCounty, setHoveredCounty] = useState<AdminRegionalCounty | null>(null);
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

    /**
     * Stable counties array for `ProvinceSvg` — only changes when `data.counties` does.
     * Without this, every parent re-render (e.g. from `setPointer`) creates a new array
     * reference, which cascades through `ProvinceSvg`'s `useMemo`s and triggers a render loop
     * with the contrast-pass `useEffect`.
     */
    const childCounties = useMemo(
        () =>
            (data?.counties ?? []).map((c) => ({
                name: c.name.fa,
                ordersCount: c.ordersCount,
                revenueMinor: c.revenueMinor,
                matched: c.matched,
            })),
        [data?.counties],
    );

    /**
     * rAF-throttle the pointer setter so high-frequency `pointermove` (60-120 Hz on trackpads)
     * collapses to at most one render per frame.
     */
    const rafRef = useRef<number | null>(null);
    const pendingRef = useRef<{ x: number; y: number } | null>(null);
    const setPointerThrottled = useCallback((x: number, y: number) => {
        pendingRef.current = { x, y };
        if (rafRef.current !== null) return;
        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            if (pendingRef.current !== null) setPointer(pendingRef.current);
        });
    }, []);

    useEffect(
        () => () => {
            if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
        },
        [],
    );

    return (
        <motion.div
            key={`province-${code}`}
            variants={svgVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: SVG_CROSSFADE_DURATION }}
            className="flex flex-col gap-4"
        >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiTile
                    label={t("totalOrders")}
                    value={data?.ordersCount ?? 0}
                    formatAs="number"
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                />
                <KpiTile
                    label={t("totalRevenue")}
                    value={data?.revenueMinor ?? 0}
                    formatAs="money"
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                />
                <KpiTile
                    label={t("topCounty")}
                    value={topCounty ? (metric === "revenue" ? topCounty.revenueMinor : topCounty.ordersCount) : 0}
                    formatAs={metric === "revenue" ? "money" : "number"}
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                    sublabel={topCounty?.name.fa}
                />
            </div>

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
                <div className="relative xl:col-span-2">
                    {isPending ? (
                        <Skeleton className="h-[500px] w-full" />
                    ) : (
                        <MapZoomWrapper className="h-[500px]">
                            <ProvinceSvg
                                code={code}
                                counties={childCounties}
                                metric={metric}
                                onCountyHover={(marker) => {
                                    if (marker === null) {
                                        setHoveredCounty(null);
                                        return;
                                    }
                                    const original = data?.counties.find((c) => c.name.fa === marker.name);
                                    setHoveredCounty(original ?? null);
                                }}
                                onPointerMove={(event) => setPointerThrottled(event.clientX, event.clientY)}
                            />
                        </MapZoomWrapper>
                    )}
                    <motion.button
                        type="button"
                        onClick={onBack}
                        whileTap={reduce ? undefined : { scale: 0.97 }}
                        className="absolute start-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border bg-card/90 px-2.5 py-1 text-sm shadow-sm backdrop-blur-sm transition-colors hover:bg-accent"
                        aria-label={t("backToCountry")}
                        title={t("backToCountry")}
                    >
                        <ChevronLeft className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                        <span className="whitespace-nowrap font-semibold text-foreground">{t("backToCountry")}</span>
                    </motion.button>
                    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                        <span className="rounded-md border bg-card/90 px-3 py-1 font-semibold text-foreground text-sm shadow-sm backdrop-blur-sm">
                            {data?.name[locale] ?? code}
                        </span>
                    </div>
                    {hoveredCounty !== null && pointer !== null ? (
                        <MapTooltip position={pointer}>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-medium">{hoveredCounty.name.fa}</span>
                                <span className="text-muted-foreground">
                                    {t("totalOrders")}: {formatNumber(hoveredCounty.ordersCount, locale)}
                                </span>
                                <span className="text-muted-foreground">
                                    {t("totalRevenue")}: {formatMoney(hoveredCounty.revenueMinor, locale)}
                                </span>
                                {!hoveredCounty.matched ? (
                                    <span className="text-muted-foreground italic">{t("unmatchedCounty")}</span>
                                ) : null}
                            </div>
                        </MapTooltip>
                    ) : null}
                </div>

                <div className="flex h-[500px] flex-col gap-3">
                    <MapLegend scale={scale} metric={metric} locale={locale} />
                    {isPending ? (
                        <Skeleton className="flex min-h-0 flex-1 rounded-lg" />
                    ) : isError ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-card">
                            <p className="text-muted-foreground text-xs">{tCommon("errorLoading")}</p>
                        </div>
                    ) : (
                        <CountyList counties={data?.counties ?? []} metric={metric} locale={locale} />
                    )}
                </div>
            </div>

            <section className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                <h4 className="font-medium text-sm">{t("topProductsLabel")}</h4>
                {isPending ? (
                    <div className="flex flex-col gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={`tp-skel-${i.toString()}`} className="h-8 w-full" />
                        ))}
                    </div>
                ) : isError ? (
                    <p className="text-muted-foreground text-xs">{tCommon("errorLoading")}</p>
                ) : (
                    <TopProductsList products={data?.topProducts ?? []} locale={locale} />
                )}
            </section>
        </motion.div>
    );
}
