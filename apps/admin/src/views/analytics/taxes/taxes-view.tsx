"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Calculator, Receipt, ReceiptText, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatMoney, formatNumber, formatPercent } from "#/lib/format";
import { type TaxesReportRow, useSalesStats, useTaxesReportTable } from "#/lib/queries/analytics";

import { downloadReportCsv } from "../components/export-csv";
import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { ReportTableCard, type TableColumn } from "../components/report-table-card";
import { salesSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

export function TaxesView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const [page, setPage] = useState(1);
    const stats = useSalesStats(window);
    const table = useTaxesReportTable(window, { page, orderBy: "total_tax", orderDir: "desc" });

    const totals = stats.data?.totals;
    const prior = stats.data?.comparison?.totals;
    const cmp = compare === "previous_year" ? t("compare.vsPrevYear") : t("compare.vsPrevPeriod");
    const money = (v: number) => formatMoney(v, locale);
    const num = (v: number) => formatNumber(v, locale);

    const tiles: ReportStat[] = [
        {
            label: t("metrics.totalTax"),
            value: money(totals?.taxes ?? 0),
            delta: buildDelta(totals?.taxes ?? 0, prior?.taxes, cmp),
            icon: Calculator,
            tone: "info",
        },
        {
            label: t("metrics.orderTax"),
            value: money(totals?.order_tax ?? 0),
            delta: buildDelta(totals?.order_tax ?? 0, prior?.order_tax, cmp),
            icon: Receipt,
            tone: "neutral",
        },
        {
            label: t("metrics.shippingTax"),
            value: money(totals?.shipping_tax ?? 0),
            delta: buildDelta(totals?.shipping_tax ?? 0, prior?.shipping_tax, cmp),
            icon: Truck,
            tone: "neutral",
        },
        {
            label: t("metrics.orders"),
            value: num(totals?.orders ?? 0),
            delta: buildDelta(totals?.orders ?? 0, prior?.orders, cmp),
            icon: ReceiptText,
            tone: "default",
        },
    ];

    const columns: TableColumn<TaxesReportRow>[] = [
        { id: "code", header: t("table.taxCode"), cell: (r) => <span className="font-medium">{r.code}</span> },
        { id: "rate", header: t("table.rate"), cell: (r) => formatPercent(r.rate, locale), className: "text-end" },
        { id: "orders", header: t("metrics.orders"), cell: (r) => num(r.orders), className: "text-end" },
        { id: "total", header: t("metrics.totalTax"), cell: (r) => money(r.total_tax), className: "text-end" },
        { id: "order", header: t("metrics.orderTax"), cell: (r) => money(r.order_tax), className: "text-end" },
        { id: "shipping", header: t("metrics.shippingTax"), cell: (r) => money(r.shipping_tax), className: "text-end" },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.taxes")}</h1>
                <FreshnessChip generatedAt={stats.data?.generated_at} />
            </div>

            <ReportStatCards items={tiles} isLoading={stats.isPending} columns={4} />

            <ReportSeriesChart
                title={t("metrics.totalTax")}
                data={salesSeries(stats.data, "taxes")}
                kind="money"
                currentLabel={t("metrics.totalTax")}
                compareLabel={cmp}
                showCompare={compare !== "none"}
                isLoading={stats.isPending}
            />

            <ReportTableCard<TaxesReportRow>
                title={t("reports.taxes")}
                columns={columns}
                rows={table.data?.data ?? []}
                meta={table.data?.meta}
                getRowKey={(r) => r.code}
                isLoading={table.isPending}
                onPageChange={setPage}
                onExport={() => downloadReportCsv("taxes", { date_from: window.from, date_to: window.to })}
            />
        </div>
    );
}
