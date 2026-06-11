"use client";

import type { Locale } from "@calibra/shared/i18n";
import { CheckCircle2, PiggyBank, RefreshCcw, ShoppingBag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { SalesComparisonChart } from "#/components/charts/SalesComparisonChart";
import { PageHeader } from "#/components/PageHeader";
import { StatCard } from "#/components/StatCard";
import { SubTabs } from "#/components/SubTabs";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import { useSalesReport } from "#/lib/queries/reports";

/**
 * Sales report screen. The page chrome (header + tab strip) paints instantly; the KPI tiles and the
 * revenue/refunds chart stream in through {@link useSalesReport} (composed client-side from the order
 * list) with a skeleton while loading and a retry-able error state. Replaces the former server-rendered
 * page that blocked the whole route on `getSalesReport`.
 */
export function SalesReportView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Reports");
    const salesT = useTranslations("Reports.sales");
    const tCommon = useTranslations("Common");
    const { data, isLoading, isError, refetch } = useSalesReport();

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <SubTabs
                namespace="Reports.tabs"
                tabs={[
                    { href: "/reports", labelKey: "sales" },
                    { href: "/reports/top-sellers", labelKey: "topSellers" },
                ]}
            />

            {isLoading ? (
                <ReportSkeleton />
            ) : isError || data === undefined ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground text-sm">
                        <span>{tCommon("errorLoading")}</span>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                            {tCommon("retry")}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <StatCard
                            label={salesT("totalRevenue")}
                            value={formatMoney(data.totalRevenue, locale)}
                            icon={PiggyBank}
                        />
                        <StatCard label={salesT("netRevenue")} value={formatMoney(data.netRevenue, locale)} icon={CheckCircle2} />
                        <StatCard
                            label={salesT("refundedAmount")}
                            value={formatMoney(data.refundedAmount, locale)}
                            icon={RefreshCcw}
                        />
                        <StatCard label={salesT("averageOrder")} value={formatMoney(data.averageOrderValue, locale)} />
                        <StatCard label={salesT("orderCount")} value={formatNumber(data.orderCount, locale)} icon={ShoppingBag} />
                    </div>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">{salesT("chartTitle")}</CardTitle>
                            <CardDescription>{salesT("subtitle")}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <SalesComparisonChart data={data.series} />
                        </CardContent>
                    </Card>
                </>
            )}
        </section>
    );
}

/** Loading placeholder mirroring the five KPI tiles + the chart card so the layout never shifts. */
function ReportSkeleton() {
    return (
        <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={`kpi-skeleton-${String(i)}`}>
                        <CardContent className="flex flex-col gap-3 py-5">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-7 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card>
                <CardContent className="py-6">
                    <Skeleton className="h-80 w-full" />
                </CardContent>
            </Card>
        </>
    );
}
