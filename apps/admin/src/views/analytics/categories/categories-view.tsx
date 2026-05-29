"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Package, ReceiptText, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatMoney, formatNumber } from "#/lib/format";
import { type CategoriesReportRow, useCategoriesReportTable, useSalesStats } from "#/lib/queries/analytics";

import { downloadReportCsv } from "../components/export-csv";
import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { ReportTableCard, type TableColumn } from "../components/report-table-card";
import { salesSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

export function CategoriesView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const [page, setPage] = useState(1);
    const stats = useSalesStats(window);
    const table = useCategoriesReportTable(window, { page, orderBy: "items_sold", orderDir: "desc" });

    const totals = stats.data?.totals;
    const prior = stats.data?.comparison?.totals;
    const cmp = compare === "previous_year" ? t("compare.vsPrevYear") : t("compare.vsPrevPeriod");
    const money = (v: number) => formatMoney(v, locale);
    const num = (v: number) => formatNumber(v, locale);

    const tiles: ReportStat[] = [
        {
            label: t("metrics.itemsSold"),
            value: num(totals?.items_sold ?? 0),
            delta: buildDelta(totals?.items_sold ?? 0, prior?.items_sold, cmp),
            icon: Package,
            tone: "info",
        },
        {
            label: t("metrics.netSales"),
            value: money(totals?.net_sales ?? 0),
            delta: buildDelta(totals?.net_sales ?? 0, prior?.net_sales, cmp),
            icon: Wallet,
            tone: "success",
        },
        {
            label: t("metrics.orders"),
            value: num(totals?.orders ?? 0),
            delta: buildDelta(totals?.orders ?? 0, prior?.orders, cmp),
            icon: ReceiptText,
            tone: "default",
        },
    ];

    const columns: TableColumn<CategoriesReportRow>[] = [
        { id: "name", header: t("table.category"), cell: (r) => r.name || "—" },
        { id: "items", header: t("metrics.itemsSold"), cell: (r) => num(r.items_sold), className: "text-end" },
        { id: "net", header: t("metrics.netSales"), cell: (r) => money(r.net_sales), className: "text-end" },
        { id: "products", header: t("table.productsCount"), cell: (r) => num(r.products), className: "text-end" },
        { id: "orders", header: t("metrics.orders"), cell: (r) => num(r.orders), className: "text-end" },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.categories")}</h1>
                <FreshnessChip generatedAt={stats.data?.generated_at} />
            </div>

            <ReportStatCards items={tiles} isLoading={stats.isPending} columns={3} />

            <ReportSeriesChart
                title={t("metrics.itemsSold")}
                data={salesSeries(stats.data, "items_sold")}
                kind="number"
                currentLabel={t("metrics.itemsSold")}
                compareLabel={cmp}
                showCompare={compare !== "none"}
                isLoading={stats.isPending}
            />

            <ReportTableCard<CategoriesReportRow>
                title={t("reports.categories")}
                columns={columns}
                rows={table.data?.data ?? []}
                meta={table.data?.meta}
                getRowKey={(r) => r.category_id}
                isLoading={table.isPending}
                onPageChange={setPage}
                onExport={() => downloadReportCsv("categories", { date_from: window.from, date_to: window.to })}
            />
        </div>
    );
}
