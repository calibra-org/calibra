"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalProvinceDetail } from "#/lib/types";
import { IRAN_COUNTRY_PROVINCES, IRAN_COUNTRY_VIEWBOX } from "#/vendor/iran-map";

import { CityList } from "./city-list";
import { KpiTile } from "./kpi-tile";
import { FAST_SPRING, SVG_CROSSFADE_DURATION, svgVariants } from "./motion-variants";
import { TopProductsList } from "./top-products-list";
import type { HeatmapMetric } from "./heatmap-scale";

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
    const dir = locale === "fa" ? -1 : 1;
    const slideOffset = (reduce ? 0 : 16) * dir;

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onBack();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onBack]);

    const province = IRAN_COUNTRY_PROVINCES.find((p) => p.code === code) ?? null;
    const topCity =
        data?.cities && data.cities.length > 0
            ? [...data.cities].sort((a, b) =>
                  metric === "revenue" ? b.revenueMinor - a.revenueMinor : b.ordersCount - a.ordersCount,
              )[0]
            : null;

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
            <AnimatePresence>
                <motion.button
                    type="button"
                    onClick={onBack}
                    initial={{ opacity: 0, x: slideOffset }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={reduce ? { duration: 0 } : FAST_SPRING}
                    whileHover={reduce ? undefined : { scale: 1.04 }}
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-accent"
                >
                    <ChevronLeft className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                    <span>{t("backToCountry")}</span>
                </motion.button>
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    label={t("topCity")}
                    value={topCity ? (metric === "revenue" ? topCity.revenueMinor : topCity.ordersCount) : 0}
                    formatAs={metric === "revenue" ? "money" : "number"}
                    locale={locale}
                    isPending={isPending}
                    isError={isError}
                    sublabel={topCity?.name.fa}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="relative">
                    <svg viewBox={IRAN_COUNTRY_VIEWBOX} className="h-auto w-full">
                        {province ? (
                            <motion.path
                                layoutId={`region-${code}`}
                                d={province.path}
                                fill={metric === "revenue" ? "#ef4444" : "#3b82f6"}
                                stroke="white"
                                strokeWidth={1.2}
                            />
                        ) : null}
                    </svg>
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center">
                        <span className="rounded bg-card/80 px-2 py-0.5 font-medium text-xs">{data?.name[locale] ?? code}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
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

                    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                        <h4 className="font-medium text-sm">{t("citiesHeading")}</h4>
                        {isPending ? (
                            <div className="flex flex-col gap-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <Skeleton key={`ci-skel-${i.toString()}`} className="h-6 w-full" />
                                ))}
                            </div>
                        ) : isError ? (
                            <p className="text-muted-foreground text-xs">{tCommon("errorLoading")}</p>
                        ) : (
                            <CityList cities={data?.cities ?? []} metric={metric} locale={locale} />
                        )}
                    </section>

                    {!isPending && !isError && data ? (
                        <p className="text-muted-foreground text-xs">
                            {formatNumber(data.cities.length, locale)} · {formatMoney(data.revenueMinor, locale)}
                        </p>
                    ) : null}
                </div>
            </div>
        </motion.div>
    );
}
