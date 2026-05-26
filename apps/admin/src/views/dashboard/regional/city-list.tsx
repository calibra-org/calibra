"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { ScrollArea } from "#/components/ui/scroll-area";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalCity } from "#/lib/types";

import type { HeatmapMetric } from "./heatmap-scale";
import { itemVariants, listVariants } from "./motion-variants";

interface CityListProps {
    cities: AdminRegionalCity[];
    metric: HeatmapMetric;
    locale: Locale;
}

/**
 * Cities list rendered inside the province sidebar — mirrors the country view's
 * `TopProvinceList` shape (flex-1 card + `ScrollArea h-full`) so when the operator toggles
 * between modes the sidebar measures the same height and there's zero layout shift.
 */
export function CityList({ cities, metric, locale }: CityListProps) {
    const t = useTranslations("Dashboard.regional");
    const tCommon = useTranslations("Common");

    const ranked = [...cities].sort((a, b) =>
        metric === "revenue" ? b.revenueMinor - a.revenueMinor : b.ordersCount - a.ordersCount,
    );

    if (ranked.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-card">
                <p className="py-4 text-center text-muted-foreground text-xs">{tCommon("noResults")}</p>
            </div>
        );
    }

    const max =
        metric === "revenue"
            ? Math.max(...ranked.map((c) => c.revenueMinor), 1)
            : Math.max(...ranked.map((c) => c.ordersCount), 1);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            <ScrollArea className="h-full">
                <motion.ul className="flex flex-col gap-2 p-3" variants={listVariants} initial="hidden" animate="show">
                    {ranked.map((city, index) => {
                        const value = metric === "revenue" ? city.revenueMinor : city.ordersCount;
                        const percent = (value / max) * 100;
                        const formatted =
                            metric === "revenue" ? formatMoney(city.revenueMinor, locale) : formatNumber(city.ordersCount, locale);
                        const key = city.regionCode ?? `unmatched-${index.toString()}-${city.name.fa}`;
                        return (
                            <motion.li
                                key={key}
                                variants={itemVariants}
                                className="flex flex-col gap-1 rounded p-1.5 transition-colors hover:bg-accent"
                            >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className={city.matched ? "truncate font-medium" : "truncate font-medium italic text-muted-foreground"}>
                                        {city.name.fa}
                                        {!city.matched ? (
                                            <span className="ms-1 text-muted-foreground text-[10px]">{t("unmatchedCity")}</span>
                                        ) : null}
                                    </span>
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
