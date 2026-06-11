"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { RevenueBarChart } from "#/components/charts/RevenueBarChart";
import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SubTabs } from "#/components/SubTabs";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { getTopSellersFixture } from "#/lib/fixtures/top-sellers";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

interface TopRow {
    productId: number;
    name: { fa: string; en: string };
    sku: string;
    units: number;
    revenue: number;
}

/**
 * Top-sellers report screen. Renders the static {@link getTopSellersFixture} — there is no first-party
 * top-sellers endpoint yet, so the data is local and the screen paints instantly. Replaces the former
 * server-rendered page; the chart + table markup is preserved verbatim.
 */
export function TopSellersView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Reports");
    const topT = useTranslations("Reports.topSellers");
    const cols = topT.raw("table") as Record<string, string>;
    const report = useMemo(() => getTopSellersFixture(), []);

    const chartData = report.rows.map((row) => ({
        label: row.name[locale].length > 16 ? `${row.name[locale].slice(0, 14)}…` : row.name[locale],
        value: row.revenue,
    }));

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={topT("subtitle", {
                    start: formatDate(report.range.startDate, locale),
                    end: formatDate(report.range.endDate, locale),
                })}
            />
            <SubTabs
                namespace="Reports.tabs"
                tabs={[
                    { href: "/reports", labelKey: "sales" },
                    { href: "/reports/top-sellers", labelKey: "topSellers" },
                ]}
            />

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{topT("chartTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <RevenueBarChart data={chartData} />
                </CardContent>
            </Card>

            <DataTable<TopRow>
                columns={[
                    {
                        id: "product",
                        header: cols.product,
                        cell: (row) => (
                            <Link href={`/products/${row.productId}` as never} className="font-medium hover:underline">
                                {row.name[locale]}
                            </Link>
                        ),
                    },
                    {
                        id: "sku",
                        header: cols.sku,
                        cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.sku}</span>,
                    },
                    { id: "units", header: cols.units, cell: (row) => formatNumber(row.units, locale), className: "text-end" },
                    {
                        id: "revenue",
                        header: cols.revenue,
                        cell: (row) => <span className="font-medium">{formatMoney(row.revenue, locale)}</span>,
                        className: "text-end",
                    },
                ]}
                rows={report.rows}
                getRowKey={(row) => row.productId}
                emptyState="—"
            />
        </section>
    );
}
