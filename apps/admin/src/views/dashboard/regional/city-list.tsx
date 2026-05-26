"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { Progress } from "#/components/ui/progress";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalCity } from "#/lib/types";

import { type HeatmapMetric } from "./heatmap-scale";
import { itemVariants, listVariants } from "./motion-variants";

interface CityListProps {
    cities: AdminRegionalCity[];
    metric: HeatmapMetric;
    locale: Locale;
    limit?: number;
}

export function CityList({ cities, metric, locale, limit = 8 }: CityListProps) {
    const t = useTranslations("Dashboard.regional");
    const tCommon = useTranslations("Common");

    const ranked = [...cities].sort((a, b) =>
        metric === "revenue" ? b.revenueMinor - a.revenueMinor : b.ordersCount - a.ordersCount,
    );
    const visible = ranked.slice(0, limit);
    if (visible.length === 0) {
        return <p className="py-4 text-center text-muted-foreground text-xs">{tCommon("noResults")}</p>;
    }

    const max = metric === "revenue"
        ? Math.max(...visible.map((c) => c.revenueMinor), 1)
        : Math.max(...visible.map((c) => c.ordersCount), 1);

    return (
        <motion.ul className="flex flex-col gap-2" variants={listVariants} initial="hidden" animate="show">
            {visible.map((city, index) => {
                const value = metric === "revenue" ? city.revenueMinor : city.ordersCount;
                const percent = (value / max) * 100;
                const formatted = metric === "revenue" ? formatMoney(city.revenueMinor, locale) : formatNumber(city.ordersCount, locale);
                const key = city.regionCode ?? `unmatched-${index.toString()}-${city.name.fa}`;
                return (
                    <motion.li key={key} variants={itemVariants} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <span className={city.matched ? "" : "italic text-muted-foreground"}>
                                {city.name.fa}
                                {!city.matched ? <span className="ms-1 text-muted-foreground text-xs">{t("unmatchedCity")}</span> : null}
                            </span>
                            <span className="shrink-0 tabular-nums">{formatted}</span>
                        </div>
                        <Progress value={percent} />
                    </motion.li>
                );
            })}
        </motion.ul>
    );
}
