"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { type CouponsReportRow, useCouponsReportTable, useCouponsStats } from "#/lib/queries/analytics";

import { downloadReportCsv } from "../components/export-csv";
import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { ReportTableCard, type TableColumn } from "../components/report-table-card";
import { couponsSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

export function CouponsView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const [page, setPage] = useState(1);
    const stats = useCouponsStats(window);
    const table = useCouponsReportTable(window, { page, orderBy: "amount", orderDir: "desc" });

    const totals = stats.data?.totals;
    const prior = stats.data?.comparison?.totals;
    const cmp = compare === "previous_year" ? t("compare.vsPrevYear") : t("compare.vsPrevPeriod");
    const money = (v: number) => formatMoney(v, locale);
    const num = (v: number) => formatNumber(v, locale);

    const tiles: ReportStat[] = [
        {
            label: t("metrics.discountedOrders"),
            value: num(totals?.discounted_orders ?? 0),
            delta: buildDelta(totals?.discounted_orders ?? 0, prior?.discounted_orders, cmp),
        },
        {
            label: t("metrics.amount"),
            value: money(totals?.amount ?? 0),
            delta: buildDelta(totals?.amount ?? 0, prior?.amount, cmp),
        },
    ];

    const columns: TableColumn<CouponsReportRow>[] = [
        { id: "code", header: t("table.couponCode"), cell: (r) => <span className="font-medium">{r.code}</span> },
        { id: "orders", header: t("metrics.orders"), cell: (r) => num(r.orders), className: "text-end" },
        { id: "amount", header: t("table.amountDiscounted"), cell: (r) => money(r.amount), className: "text-end" },
        { id: "created", header: t("table.created"), cell: (r) => (r.created_at ? formatDate(r.created_at, locale) : "—") },
        { id: "expires", header: t("table.expires"), cell: (r) => (r.expires_at ? formatDate(r.expires_at, locale) : "—") },
        { id: "type", header: t("table.type"), cell: (r) => (r.type ? t(`couponType.${r.type}` as never) : "—") },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.coupons")}</h1>
                <FreshnessChip generatedAt={stats.data?.generated_at} />
            </div>

            <ReportStatCards items={tiles} isLoading={stats.isPending} columns={2} />

            <ReportSeriesChart
                title={t("metrics.discountedOrders")}
                data={couponsSeries(stats.data, "discounted_orders")}
                kind="number"
                currentLabel={t("metrics.discountedOrders")}
                compareLabel={cmp}
                showCompare={compare !== "none"}
                isLoading={stats.isPending}
            />

            <ReportTableCard<CouponsReportRow>
                title={t("reports.coupons")}
                columns={columns}
                rows={table.data?.data ?? []}
                meta={table.data?.meta}
                getRowKey={(r) => r.code}
                isLoading={table.isPending}
                onPageChange={setPage}
                onExport={() => downloadReportCsv("coupons", { date_from: window.from, date_to: window.to })}
            />
        </div>
    );
}
