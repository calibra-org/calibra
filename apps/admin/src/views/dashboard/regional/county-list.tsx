"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { ScrollArea } from "#/components/ui/scroll-area";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminRegionalCounty } from "#/lib/types";

import { itemVariants, listVariants } from "./motion-variants";
import type { HeatmapMetric } from "./heatmap-scale";

interface CountyListProps {
    counties: AdminRegionalCounty[];
    metric: HeatmapMetric;
    locale: Locale;
}

/**
 * Counties (شهرستان) list rendered inside the province sidebar — mirrors the country view's
 * `TopProvinceList` shape (flex-1 card + `ScrollArea h-full`) so when the operator toggles
 * between modes the sidebar measures the same height and there's zero layout shift.
 */
export function CountyList({ counties, metric, locale }: CountyListProps) {
    const t = useTranslations("Dashboard.regional");
    const tCommon = useTranslations("Common");

    const ranked = [...counties].sort((a, b) =>
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
                    {ranked.map((county, index) => {
                        const value = metric === "revenue" ? county.revenueMinor : county.ordersCount;
                        const percent = (value / max) * 100;
                        const formatted =
                            metric === "revenue"
                                ? formatMoney(county.revenueMinor, locale)
                                : formatNumber(county.ordersCount, locale);
                        const key = `${county.matched ? "c" : "u"}-${index.toString()}-${county.name.fa}`;
                        return (
                            <motion.li
                                key={key}
                                variants={itemVariants}
                                className="flex flex-col gap-1 rounded p-1.5 transition-colors hover:bg-accent"
                            >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span
                                        className={
                                            county.matched
                                                ? "truncate font-medium"
                                                : "truncate font-medium text-muted-foreground italic"
                                        }
                                    >
                                        {county.name.fa}
                                        {!county.matched ? (
                                            <span className="ms-1 text-[10px] text-muted-foreground">{t("unmatchedCounty")}</span>
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
