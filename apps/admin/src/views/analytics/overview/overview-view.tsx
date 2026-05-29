"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Boxes, Package, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CardContent, CardHeader, CardRoot, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import { useSalesStats, useTopCategoriesLeaderboard, useTopProductsLeaderboard } from "#/lib/queries/analytics";

import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { salesSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

export function OverviewView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const stats = useSalesStats(window);
    const topProducts = useTopProductsLeaderboard();
    const topCategories = useTopCategoriesLeaderboard();

    const totals = stats.data?.totals;
    const prior = stats.data?.comparison?.totals;
    const cmp = compare === "previous_year" ? t("compare.vsPrevYear") : t("compare.vsPrevPeriod");
    const money = (v: number) => formatMoney(v, locale);
    const num = (v: number) => formatNumber(v, locale);

    const tiles: ReportStat[] = [
        {
            label: t("metrics.totalSales"),
            value: money(totals?.total_sales ?? 0),
            delta: buildDelta(totals?.total_sales ?? 0, prior?.total_sales, cmp),
            icon: Wallet,
            href: "/analytics/revenue",
        },
        {
            label: t("metrics.netSales"),
            value: money(totals?.net_sales ?? 0),
            delta: buildDelta(totals?.net_sales ?? 0, prior?.net_sales, cmp),
            icon: TrendingUp,
            href: "/analytics/revenue",
        },
        {
            label: t("metrics.orders"),
            value: num(totals?.orders ?? 0),
            delta: buildDelta(totals?.orders ?? 0, prior?.orders, cmp),
            icon: ReceiptText,
            href: "/analytics/orders",
        },
        {
            label: t("metrics.productsSold"),
            value: num(totals?.products_sold ?? 0),
            delta: buildDelta(totals?.products_sold ?? 0, prior?.products_sold, cmp),
            icon: Package,
            href: "/analytics/products",
        },
        {
            label: t("metrics.variationsSold"),
            value: num(totals?.variations_sold ?? 0),
            delta: buildDelta(totals?.variations_sold ?? 0, prior?.variations_sold, cmp),
            icon: Boxes,
            href: "/analytics/products",
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.overview")}</h1>
                <FreshnessChip generatedAt={stats.data?.generated_at} />
            </div>

            <ReportStatCards items={tiles} isLoading={stats.isPending} columns={5} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ReportSeriesChart
                    title={t("metrics.orders")}
                    data={salesSeries(stats.data, "orders")}
                    kind="number"
                    currentLabel={t("metrics.orders")}
                    compareLabel={cmp}
                    showCompare={compare !== "none"}
                    isLoading={stats.isPending}
                />
                <ReportSeriesChart
                    title={t("metrics.netSales")}
                    data={salesSeries(stats.data, "net_sales")}
                    kind="money"
                    currentLabel={t("metrics.netSales")}
                    compareLabel={cmp}
                    showCompare={compare !== "none"}
                    isLoading={stats.isPending}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Leaderboard
                    title={t("leaderboards.topProducts")}
                    isLoading={topProducts.isPending}
                    rows={(topProducts.data?.data ?? []).map((r) => ({ name: r.name, value: num(r.units) }))}
                    valueLabel={t("leaderboards.units")}
                />
                <Leaderboard
                    title={t("leaderboards.topCategories")}
                    isLoading={topCategories.isPending}
                    rows={(topCategories.data?.data ?? []).map((r) => ({ name: r.name, value: num(r.units) }))}
                    valueLabel={t("leaderboards.units")}
                />
            </div>
        </div>
    );
}

function Leaderboard({
    title,
    rows,
    valueLabel,
    isLoading,
}: {
    title: string;
    rows: { name: string; value: string }[];
    valueLabel: string;
    isLoading: boolean;
}) {
    const t = useTranslations("Analytics");
    return (
        <CardRoot>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-40 w-full rounded-md" />
                ) : rows.length === 0 ? (
                    <div className="grid h-40 place-items-center text-muted-foreground text-sm">{t("empty")}</div>
                ) : (
                    <ol className="flex flex-col gap-2">
                        {rows.map((row, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: leaderboard rows have no stable id; rank order is the key
                            <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[0.7rem] text-muted-foreground tabular-nums">
                                        {index + 1}
                                    </span>
                                    <span className="truncate">{row.name || "—"}</span>
                                </span>
                                <span className="shrink-0 font-medium tabular-nums">
                                    {row.value} <span className="text-muted-foreground text-xs">{valueLabel}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
            </CardContent>
        </CardRoot>
    );
}
