"use client";

import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { Reveal } from "#/components/Reveal";
import { StatCard } from "#/components/StatCard";
import { StatusPill, tenantStatusTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ShoppingBag, Store, TriangleAlert, Users, Wallet } from "#/icons";
import { formatBytes, formatCompact, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useOverview, useTenants } from "#/lib/queries";
import { cn } from "#/lib/utils";

/** Segmented bar of the fleet by lifecycle status — active / suspended / archived. */
function FleetStatusStrip({ active, suspended, archived }: { active: number; suspended: number; archived: number }) {
    const t = useTranslations("Overview");
    const tt = useTranslations("Tenants");
    const locale = useLocale();
    const total = Math.max(1, active + suspended + archived);
    const segments = [
        { key: "active", value: active, bar: "bg-success", label: tt("statusActive") },
        { key: "suspended", value: suspended, bar: "bg-warning", label: tt("statusSuspended") },
        { key: "archived", value: archived, bar: "bg-muted-foreground/50", label: tt("statusArchived") },
    ];

    return (
        <div className="mission-panel p-4">
            <p className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">{t("fleetStatus")}</p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {segments.map((segment) => (
                    <div
                        key={segment.key}
                        className={cn("h-full transition-[width] duration-500", segment.bar)}
                        style={{ width: `${(segment.value / total) * 100}%` }}
                    />
                ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {segments.map((segment) => (
                    <span key={segment.key} className="inline-flex items-center gap-1.5 text-sm">
                        <span className={cn("size-2 rounded-full", segment.bar)} aria-hidden="true" />
                        <span className="text-muted-foreground">{segment.label}</span>
                        <span className="font-medium tabular-nums">{formatNumber(segment.value, locale)}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

export function OverviewView() {
    const t = useTranslations("Overview");
    const tt = useTranslations("Tenants");
    const tc = useTranslations("Common");
    const locale = useLocale();
    const overview = useOverview();
    const tenants = useTenants({ page: 1 });

    const gmv = overview.data?.revenue_30d ?? [];
    const primaryGmv = gmv[0];

    /** Fleet 14-day revenue sparkline — element-wise sum of the loaded shops' per-row sparks. */
    const fleetSpark = (tenants.data?.data ?? []).reduce<number[]>((acc, shop) => {
        shop.spark.forEach((value, index) => {
            acc[index] = (acc[index] ?? 0) + value;
        });
        return acc;
    }, []);
    /** Week-over-week trend on the fleet spark (last 7 days vs the prior 7). */
    const lastWeek = fleetSpark.slice(7).reduce((a, b) => a + b, 0);
    const priorWeek = fleetSpark.slice(0, 7).reduce((a, b) => a + b, 0);
    const fleetTrend = priorWeek > 0 ? Math.round(((lastWeek - priorWeek) / priorWeek) * 100) : null;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} />

            {overview.isError ? (
                <EmptyState
                    icon={TriangleAlert}
                    title={tc("errorTitle")}
                    description={tc("error")}
                    action={
                        <Button variant="outline" onClick={() => overview.refetch()}>
                            {tc("retry")}
                        </Button>
                    }
                />
            ) : (
                <Reveal>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {overview.isPending || !overview.data ? (
                            ["s1", "s2", "s3", "s4"].map((k) => <Skeleton key={k} className="h-28 rounded-lg" />)
                        ) : (
                            <>
                                <StatCard
                                    label={t("shopsTotal")}
                                    countUp={{ to: overview.data.shops.total, format: (n) => formatNumber(n, locale) }}
                                    sublabel={`${formatNumber(overview.data.shops.active, locale)} ${t("shopsActive")}`}
                                    icon={Store}
                                    tone="accent"
                                />
                                <StatCard
                                    label={t("gmv30d")}
                                    value={primaryGmv ? formatMoney(primaryGmv.amount, primaryGmv.currency_code, locale) : "—"}
                                    sublabel={
                                        fleetTrend === null && gmv.length > 1
                                            ? `+${formatNumber(gmv.length - 1, locale)}`
                                            : undefined
                                    }
                                    trend={fleetTrend !== null ? { value: fleetTrend, label: t("trendVsPrev") } : undefined}
                                    spark={fleetSpark}
                                    icon={Wallet}
                                />
                                <StatCard
                                    label={t("orders30d")}
                                    countUp={{ to: overview.data.orders_30d, format: (n) => formatNumber(n, locale) }}
                                    icon={ShoppingBag}
                                />
                                <StatCard
                                    label={t("customersTotal")}
                                    countUp={{ to: overview.data.customers_total, format: (n) => formatCompact(n, locale) }}
                                    sublabel={`${formatBytes(overview.data.storage_bytes, locale)} ${t("storage")}`}
                                    icon={Users}
                                />
                            </>
                        )}
                    </div>
                </Reveal>
            )}

            {overview.data ? (
                <Reveal delay={0.05}>
                    <FleetStatusStrip
                        active={overview.data.shops.active}
                        suspended={overview.data.shops.suspended}
                        archived={overview.data.shops.archived}
                    />
                </Reveal>
            ) : null}

            <Reveal delay={0.1}>
                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-medium text-sm">{t("recentShops")}</h2>
                        <Link href="/tenants" className="text-primary text-sm underline-offset-4 hover:underline">
                            {tt("title")}
                        </Link>
                    </div>
                    <div className="mission-panel overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{tt("colName")}</TableHead>
                                    <TableHead>{tt("colStatus")}</TableHead>
                                    <TableHead>{tt("colPlan")}</TableHead>
                                    <TableHead className="text-end">{tt("colOrders")}</TableHead>
                                    <TableHead className="text-end">{tt("colRevenue")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tenants.isPending ? (
                                    ["r1", "r2", "r3", "r4"].map((k) => (
                                        <TableRow key={k}>
                                            <TableCell colSpan={5}>
                                                <Skeleton className="h-5 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : tenants.data && tenants.data.data.length > 0 ? (
                                    tenants.data.data.slice(0, 8).map((shop) => (
                                        <TableRow key={shop.id} className="transition-colors hover:bg-accent/40">
                                            <TableCell>
                                                <Link href={`/tenants/${shop.id}`} className="font-medium hover:underline">
                                                    {shop.name}
                                                </Link>
                                                <div className="font-mono text-muted-foreground text-xs">{shop.slug}</div>
                                            </TableCell>
                                            <TableCell>
                                                <StatusPill tone={tenantStatusTone(shop.status)}>
                                                    {tt(`status${cap(shop.status)}` as "statusActive")}
                                                </StatusPill>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">{shop.plan.name}</TableCell>
                                            <TableCell className="text-end tabular-nums">
                                                {formatNumber(shop.kpis.orders_30d, locale)}
                                            </TableCell>
                                            <TableCell className="text-end tabular-nums">
                                                {formatMoney(shop.kpis.revenue_30d, shop.currency_code, locale)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground text-sm">
                                            {t("empty")}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            </Reveal>
        </div>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
