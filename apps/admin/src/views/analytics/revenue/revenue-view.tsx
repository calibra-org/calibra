"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { type RevenueReportRow, useRevenueTable, useSalesStats } from "#/lib/queries/analytics";

import { downloadReportCsv } from "../components/export-csv";
import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { ReportTableCard, type TableColumn, TableTotalsFooter } from "../components/report-table-card";
import { salesSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

export function RevenueView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const [page, setPage] = useState(1);
    const stats = useSalesStats(window);
    const table = useRevenueTable(window, { page });

    const totals = stats.data?.totals;
    const prior = stats.data?.comparison?.totals;
    const cmp = compare === "previous_year" ? t("compare.vsPrevYear") : t("compare.vsPrevPeriod");
    const money = (v: number) => formatMoney(v, locale);

    const tiles: ReportStat[] = [
        {
            label: t("metrics.grossSales"),
            value: money(totals?.gross_sales ?? 0),
            delta: buildDelta(totals?.gross_sales ?? 0, prior?.gross_sales, cmp),
        },
        {
            label: t("metrics.returns"),
            value: money(totals?.returns ?? 0),
            delta: buildDelta(totals?.returns ?? 0, prior?.returns, cmp),
        },
        {
            label: t("metrics.coupons"),
            value: money(totals?.coupons ?? 0),
            delta: buildDelta(totals?.coupons ?? 0, prior?.coupons, cmp),
        },
        {
            label: t("metrics.netSales"),
            value: money(totals?.net_sales ?? 0),
            delta: buildDelta(totals?.net_sales ?? 0, prior?.net_sales, cmp),
        },
        { label: t("metrics.taxes"), value: money(totals?.taxes ?? 0), delta: buildDelta(totals?.taxes ?? 0, prior?.taxes, cmp) },
        {
            label: t("metrics.shipping"),
            value: money(totals?.shipping ?? 0),
            delta: buildDelta(totals?.shipping ?? 0, prior?.shipping, cmp),
        },
        {
            label: t("metrics.totalSales"),
            value: money(totals?.total_sales ?? 0),
            delta: buildDelta(totals?.total_sales ?? 0, prior?.total_sales, cmp),
        },
    ];

    const columns: TableColumn<RevenueReportRow>[] = [
        { id: "date", header: t("table.date"), cell: (r) => formatDate(r.date, locale) },
        { id: "orders", header: t("metrics.orders"), cell: (r) => formatNumber(r.orders, locale), className: "text-end" },
        { id: "gross", header: t("metrics.grossSales"), cell: (r) => money(r.gross_sales), className: "text-end" },
        { id: "returns", header: t("metrics.returns"), cell: (r) => money(r.returns), className: "text-end" },
        { id: "coupons", header: t("metrics.coupons"), cell: (r) => money(r.coupons), className: "text-end" },
        { id: "net", header: t("metrics.netSales"), cell: (r) => money(r.net_sales), className: "text-end" },
        { id: "taxes", header: t("metrics.taxes"), cell: (r) => money(r.taxes), className: "text-end" },
        { id: "shipping", header: t("metrics.shipping"), cell: (r) => money(r.shipping), className: "text-end" },
        { id: "total", header: t("metrics.totalSales"), cell: (r) => money(r.total_sales), className: "text-end" },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.revenue")}</h1>
                <FreshnessChip generatedAt={stats.data?.generated_at} />
            </div>

            <ReportStatCards items={tiles} isLoading={stats.isPending} columns={7} />

            <ReportSeriesChart
                title={t("metrics.grossSales")}
                data={salesSeries(stats.data, "gross_sales")}
                kind="money"
                currentLabel={t("metrics.grossSales")}
                compareLabel={cmp}
                showCompare={compare !== "none"}
                isLoading={stats.isPending}
            />

            <ReportTableCard<RevenueReportRow>
                title={t("reports.revenue")}
                columns={columns}
                rows={table.data?.data ?? []}
                meta={table.data?.meta}
                getRowKey={(r) => r.date}
                isLoading={table.isPending}
                onPageChange={setPage}
                onExport={() =>
                    downloadReportCsv("revenue", { date_from: window.from, date_to: window.to, interval: window.interval })
                }
                footer={
                    table.data?.totals ? (
                        <TableTotalsFooter>
                            <span className="font-medium">{t("totalsLabel")}</span>
                            <span>
                                {t("metrics.netSales")}: {money(table.data.totals.net_sales)}
                            </span>
                            <span>
                                {t("metrics.totalSales")}: {money(table.data.totals.total_sales)}
                            </span>
                            <span>
                                {t("metrics.orders")}: {formatNumber(table.data.totals.orders, locale)}
                            </span>
                        </TableTotalsFooter>
                    ) : undefined
                }
            />
        </div>
    );
}
