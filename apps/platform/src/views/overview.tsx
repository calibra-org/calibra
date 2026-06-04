"use client";

import { DollarSign, Package, Store, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { StatCard } from "#/components/StatCard";
import { StatusPill, tenantStatusTone } from "#/components/StatusPill";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatBytes, formatCompact, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useOverview, useTenants } from "#/lib/queries";

export function OverviewView() {
    const t = useTranslations("Overview");
    const tt = useTranslations("Tenants");
    const locale = useLocale();
    const overview = useOverview();
    const tenants = useTenants({ page: 1 });

    const gmv = overview.data?.revenue_30d ?? [];

    return (
        <div>
            <PageHeader title={t("title")} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {overview.isPending ? (
                    ["s1", "s2", "s3", "s4"].map((k) => <Skeleton key={k} className="h-24 rounded-lg" />)
                ) : overview.data ? (
                    <>
                        <StatCard
                            label={t("shopsTotal")}
                            value={formatNumber(overview.data.shops.total, locale)}
                            sublabel={`${formatNumber(overview.data.shops.active, locale)} ${t("shopsActive")}`}
                            icon={Store}
                        />
                        <StatCard
                            label={t("gmv30d")}
                            value={gmv.length > 0 ? formatMoney(gmv[0].amount, gmv[0].currency_code, locale) : "—"}
                            sublabel={gmv.length > 1 ? `+${gmv.length - 1}` : undefined}
                            icon={DollarSign}
                        />
                        <StatCard label={t("orders30d")} value={formatNumber(overview.data.orders_30d, locale)} icon={Package} />
                        <StatCard
                            label={t("customersTotal")}
                            value={formatCompact(overview.data.customers_total, locale)}
                            sublabel={`${formatBytes(overview.data.storage_bytes, locale)} ${t("storage")}`}
                            icon={Users}
                        />
                    </>
                ) : null}
            </div>

            <section className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-medium text-sm">{t("recentShops")}</h2>
                    <Link href="/tenants" className="text-primary text-sm underline-offset-4 hover:underline">
                        {tt("title")}
                    </Link>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
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
                                <TableRow>
                                    <TableCell colSpan={5}>
                                        <Skeleton className="h-5 w-full" />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                tenants.data?.data.map((shop) => (
                                    <TableRow key={shop.id}>
                                        <TableCell>
                                            <Link href={`/tenants/${shop.id}`} className="font-medium hover:underline">
                                                {shop.name}
                                            </Link>
                                            <div className="text-muted-foreground text-xs">{shop.slug}</div>
                                        </TableCell>
                                        <TableCell>
                                            <StatusPill tone={tenantStatusTone(shop.status)}>
                                                {tt(`status${cap(shop.status)}`)}
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
                            )}
                        </TableBody>
                    </Table>
                </div>
            </section>
        </div>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
