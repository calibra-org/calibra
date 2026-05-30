"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Package, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { type OrdersReportRow, useOrdersReportTable, useSalesStats } from "#/lib/queries/analytics";

import { downloadReportCsv } from "../components/export-csv";
import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { ReportTableCard, type TableColumn } from "../components/report-table-card";
import { salesSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

const STATUS_TONE: Record<string, StatusTone> = {
    completed: "success",
    processing: "info",
    pending: "warning",
    on_hold: "warning",
    cancelled: "danger",
    failed: "danger",
    refunded: "neutral",
    draft: "neutral",
};

export function OrdersView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const [page, setPage] = useState(1);
    const stats = useSalesStats(window);
    const table = useOrdersReportTable(window, { page, orderBy: "date", orderDir: "desc" });

    const totals = stats.data?.totals;
    const prior = stats.data?.comparison?.totals;
    const cmp = compare === "previous_year" ? t("compare.vsPrevYear") : t("compare.vsPrevPeriod");
    const money = (v: number) => formatMoney(v, locale);
    const num = (v: number) => formatNumber(v, locale);

    const tiles: ReportStat[] = [
        {
            label: t("metrics.orders"),
            value: num(totals?.orders ?? 0),
            delta: buildDelta(totals?.orders ?? 0, prior?.orders, cmp),
            icon: ReceiptText,
            tone: "default",
        },
        {
            label: t("metrics.netSales"),
            value: money(totals?.net_sales ?? 0),
            delta: buildDelta(totals?.net_sales ?? 0, prior?.net_sales, cmp),
            icon: Wallet,
            tone: "success",
        },
        {
            label: t("metrics.aov"),
            value: money(totals?.avg_order_value ?? 0),
            delta: buildDelta(totals?.avg_order_value ?? 0, prior?.avg_order_value, cmp),
            icon: TrendingUp,
            tone: "success",
        },
        {
            label: t("metrics.avgItems"),
            value: num(totals?.avg_items_per_order ?? 0),
            delta: buildDelta(totals?.avg_items_per_order ?? 0, prior?.avg_items_per_order, cmp),
            icon: Package,
            tone: "info",
        },
    ];

    const columns: TableColumn<OrdersReportRow>[] = [
        { id: "date", header: t("table.date"), cell: (r) => formatDate(r.date, locale) },
        { id: "number", header: t("table.orderNumber"), cell: (r) => `#${num(r.order_number)}` },
        {
            id: "status",
            header: t("table.status"),
            cell: (r) => (
                <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`orderStatus.${r.status}` as never)}</StatusBadge>
            ),
        },
        { id: "customer", header: t("table.customer"), cell: (r) => r.customer ?? "—" },
        { id: "type", header: t("table.customerType"), cell: (r) => t(`customerType.${r.customer_type}` as never) },
        { id: "products", header: t("table.products"), cell: (r) => productsLabel(r.products) },
        { id: "items", header: t("metrics.itemsSold"), cell: (r) => num(r.items_sold), className: "text-end" },
        { id: "coupons", header: t("table.coupons"), cell: (r) => (r.coupons.length > 0 ? r.coupons.join(", ") : "—") },
        {
            id: "net",
            header: t("metrics.netSales"),
            cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                    {money(r.net_sales)}
                    {r.is_refunded && <StatusBadge tone="neutral">{t("table.refunded")}</StatusBadge>}
                </span>
            ),
            className: "text-end",
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.orders")}</h1>
                <FreshnessChip generatedAt={stats.data?.generated_at} />
            </div>

            <ReportStatCards items={tiles} isLoading={stats.isPending} columns={4} />

            <ReportSeriesChart
                title={t("metrics.orders")}
                data={salesSeries(stats.data, "orders")}
                kind="number"
                currentLabel={t("metrics.orders")}
                compareLabel={cmp}
                showCompare={compare !== "none"}
                isLoading={stats.isPending}
                tone="default"
            />

            <ReportTableCard<OrdersReportRow>
                title={t("reports.orders")}
                columns={columns}
                rows={table.data?.data ?? []}
                meta={table.data?.meta}
                getRowKey={(r) => r.order_id}
                isLoading={table.isPending}
                onPageChange={setPage}
                onExport={() => downloadReportCsv("orders", { date_from: window.from, date_to: window.to })}
            />
        </div>
    );
}

function productsLabel(products: string[]): string {
    if (products.length === 0) return "—";
    if (products.length === 1) return products[0]!;
    return `${products[0]} +${products.length - 1}`;
}
