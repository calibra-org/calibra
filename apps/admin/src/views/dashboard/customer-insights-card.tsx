"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowUpRight, CircleDollarSign, ShoppingBag, Users, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { StatCard } from "#/components/StatCard";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useCustomerInsights } from "#/lib/queries/insights";
import type { AdminCustomerInsights } from "#/lib/types";

/**
 * Dashboard "Customer summary" tile. Replaces the inconsistent footer that used to live on the
 * customers list page. Renders four KPI cells (total customers, mean order count, mean lifetime
 * spend, mean order value) each with a 30-day delta arrow + an inline sparkline where the API
 * returns one, plus a horizontal progress bar for the percent of customers that have an account.
 */
export function CustomerInsightsCard() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Dashboard.customerInsights");
    const tCommon = useTranslations("Common");
    const { data, isPending, isError, refetch } = useCustomerInsights();

    return (
        <Card>
            <CardHeader className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
                        <Users className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                        <CardTitle className="text-base">{t("title")}</CardTitle>
                        <CardDescription>{t("subtitle")}</CardDescription>
                    </div>
                </div>
                <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link href="/customers">
                        {t("viewAll")}
                        <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                    </Link>
                </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pt-5">
                {isPending ? (
                    <InsightsSkeleton />
                ) : isError ? (
                    <ErrorBlock onRetry={refetch} retryLabel={tCommon("retry")} errorLabel={tCommon("errorLoading")} />
                ) : (
                    <InsightsBody data={data} locale={locale} t={t} />
                )}
            </CardContent>
        </Card>
    );
}

function InsightsBody({
    data,
    locale,
    t,
}: {
    data: AdminCustomerInsights;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    const comparison = t("delta30d");
    return (
        <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label={t("total")}
                    value={formatNumber(data.total, locale)}
                    delta={{ value: data.totalDelta30d, unit: "absolute", comparison }}
                    icon={Users}
                    tone="info"
                />
                <StatCard
                    label={t("avgOrderCount")}
                    value={formatNumber(Math.round(data.avgOrderCount * 100) / 100, locale)}
                    delta={{ value: data.avgOrderCountDelta30d, unit: "absolute", comparison }}
                    icon={ShoppingBag}
                    tone="default"
                />
                <StatCard
                    label={t("avgLifetimeSpend")}
                    value={formatMoney(data.avgLifetimeSpend, locale)}
                    delta={{ value: data.avgLifetimeSpendDelta30dPct, unit: "percent", comparison }}
                    icon={Wallet}
                    tone="success"
                />
                <StatCard
                    label={t("avgOrderValue")}
                    value={formatMoney(data.avgOrderValue, locale)}
                    delta={{ value: data.avgOrderValueDelta30dPct, unit: "percent", comparison }}
                    icon={CircleDollarSign}
                    tone="success"
                />
            </div>
        </>
    );
}

function InsightsSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholder
                <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
        </div>
    );
}

function ErrorBlock({ onRetry, retryLabel, errorLabel }: { onRetry: () => void; retryLabel: string; errorLabel: string }) {
    return (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-sm">
            <span>{errorLabel}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
            </Button>
        </div>
    );
}
