"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowUpRight, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Sparkline } from "#/components/Sparkline";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useCustomerInsights } from "#/lib/queries/insights";
import type { AdminCustomerInsights } from "#/lib/types";

/**
 * Dashboard "Customer summary" tile. Replaces the inconsistent footer that used to live on the
 * customers list page. Renders four KPI cells (total customers, mean order count, mean lifetime
 * spend, mean order value) each with a 30-day delta arrow, plus a horizontal progress bar for
 * the percent of customers that have an account. Sparklines are intentionally omitted until a
 * chart lib lands in the workspace catalog — the deltas alone give the operator a usable trend.
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
    /** Sparkline tones follow the delta sign, except spend which uses positive when growing. */
    const totalTone = data.totalDelta30d >= 0 ? "positive" : "negative";
    const spendTone = data.avgLifetimeSpendDelta30dPct >= 0 ? "positive" : "negative";

    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi
                    label={t("total")}
                    value={formatNumber(data.total, locale)}
                    delta={data.totalDelta30d}
                    deltaUnit="absolute"
                    locale={locale}
                    comparison={t("delta30d")}
                    sparkline={data.sparklines.total}
                    sparklineTone={totalTone}
                    sparklineLabel={t("sparklines.total")}
                />
                <Kpi
                    label={t("avgOrderCount")}
                    value={formatNumber(Math.round(data.avgOrderCount * 100) / 100, locale)}
                    delta={data.avgOrderCountDelta30d}
                    deltaUnit="absolute"
                    locale={locale}
                    comparison={t("delta30d")}
                />
                <Kpi
                    label={t("avgLifetimeSpend")}
                    value={formatMoney(data.avgLifetimeSpend, locale)}
                    delta={data.avgLifetimeSpendDelta30dPct}
                    deltaUnit="percent"
                    locale={locale}
                    comparison={t("delta30d")}
                    sparkline={data.sparklines.spend}
                    sparklineTone={spendTone}
                    sparklineLabel={t("sparklines.spend")}
                />
                <Kpi
                    label={t("avgOrderValue")}
                    value={formatMoney(data.avgOrderValue, locale)}
                    delta={data.avgOrderValueDelta30dPct}
                    deltaUnit="percent"
                    locale={locale}
                    comparison={t("delta30d")}
                />
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t("pctWithAccount")}</span>
                    <span className="font-medium tabular-nums">
                        {formatNumber(Math.round(data.pctWithAccount), locale)}%
                    </span>
                </div>
                <Progress value={Math.min(100, Math.max(0, data.pctWithAccount))} />
            </div>
        </>
    );
}

interface KpiProps {
    label: string;
    value: string;
    delta: number;
    /** `absolute` formats the delta as a signed integer (`+12`); `percent` adds a `%` suffix. */
    deltaUnit: "absolute" | "percent";
    comparison: string;
    locale: Locale;
    /** Optional 30-day daily series — rendered as an inline SVG sparkline behind the value. */
    sparkline?: number[];
    sparklineTone?: "positive" | "negative" | "neutral";
    sparklineLabel?: string;
}

function Kpi({ label, value, delta, deltaUnit, comparison, locale, sparkline, sparklineTone = "neutral", sparklineLabel }: KpiProps) {
    const isUp = delta >= 0;
    const TrendIcon = isUp ? TrendingUp : TrendingDown;
    const absDelta = Math.abs(delta);
    const formatted =
        deltaUnit === "percent"
            ? `${formatNumber(Math.round(absDelta * 10) / 10, locale)}%`
            : formatNumber(Math.round(absDelta), locale);
    return (
        <div className="relative flex flex-col gap-1 overflow-hidden rounded-md border border-border bg-muted/30 px-3 py-3">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-semibold text-lg tabular-nums">{value}</span>
            <span
                className={
                    isUp
                        ? "flex items-center gap-1 text-emerald-600 text-xs dark:text-emerald-400"
                        : "flex items-center gap-1 text-red-600 text-xs dark:text-red-400"
                }
            >
                <TrendIcon className="size-3" aria-hidden="true" />
                <span className="tabular-nums">{formatted}</span>
                <span className="text-muted-foreground">{comparison}</span>
            </span>
            {sparkline !== undefined && sparkline.length > 0 && (
                <div className="pointer-events-none absolute inset-x-2 bottom-1 opacity-70">
                    <Sparkline values={sparkline} width={120} height={24} tone={sparklineTone} ariaLabel={sparklineLabel} />
                </div>
            )}
        </div>
    );
}

function InsightsSkeleton() {
    return (
        <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`s-${String(i)}`} className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-3">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full" />
            </div>
        </>
    );
}

function ErrorBlock({
    onRetry,
    retryLabel,
    errorLabel,
}: {
    onRetry: () => void;
    retryLabel: string;
    errorLabel: string;
}) {
    return (
        <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground text-sm">
            <span>{errorLabel}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
            </Button>
        </div>
    );
}
