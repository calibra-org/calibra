"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Input } from "#/components/ui/input";
import { formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { type ProductsReportRow, useProductsReportTable, useSalesStats } from "#/lib/queries/analytics";

import { downloadReportCsv } from "../components/export-csv";
import { FreshnessChip } from "../components/freshness-chip";
import { ReportSeriesChart } from "../components/report-series-chart";
import { buildDelta, type ReportStat, ReportStatCards } from "../components/report-stat-cards";
import { ReportTableCard, type TableColumn } from "../components/report-table-card";
import { salesSeries } from "../lib/series";
import { useAnalyticsParams } from "../lib/use-analytics-params";

export function ProductsView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const { window, compare } = useAnalyticsParams();
    const [page, setPage] = useState(1);
    const [q, setQ] = useState("");
    const stats = useSalesStats(window);
    const table = useProductsReportTable(window, { page, q: q || undefined, orderBy: "items_sold", orderDir: "desc" });

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
        },
        {
            label: t("metrics.netSales"),
            value: money(totals?.net_sales ?? 0),
            delta: buildDelta(totals?.net_sales ?? 0, prior?.net_sales, cmp),
        },
        {
            label: t("metrics.orders"),
            value: num(totals?.orders ?? 0),
            delta: buildDelta(totals?.orders ?? 0, prior?.orders, cmp),
        },
    ];

    const columns: TableColumn<ProductsReportRow>[] = [
        {
            id: "name",
            header: t("table.productTitle"),
            cell: (r) => (
                <Link href={`/products/${r.product_id}` as never} className="text-primary hover:underline">
                    {r.name || "—"}
                </Link>
            ),
        },
        { id: "sku", header: t("table.sku"), cell: (r) => r.sku ?? "—", className: "text-muted-foreground" },
        { id: "items", header: t("metrics.itemsSold"), cell: (r) => num(r.items_sold), className: "text-end" },
        { id: "net", header: t("metrics.netSales"), cell: (r) => money(r.net_sales), className: "text-end" },
        { id: "orders", header: t("metrics.orders"), cell: (r) => num(r.orders), className: "text-end" },
        {
            id: "categories",
            header: t("table.categories"),
            cell: (r) => (r.categories.length > 0 ? r.categories.join(", ") : "—"),
        },
        { id: "variations", header: t("table.variations"), cell: (r) => num(r.variations), className: "text-end" },
        { id: "status", header: t("table.status"), cell: (r) => (r.status ? t(`productStatus.${r.status}` as never) : "—") },
        {
            id: "stock",
            header: t("table.stock"),
            cell: (r) => (r.stock === null ? t("stockUnknown") : num(r.stock)),
            className: "text-end",
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="font-semibold text-xl tracking-tight">{t("reports.products")}</h1>
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

            <div className="relative max-w-sm">
                <Search
                    className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                    }}
                    placeholder={t("searchProducts")}
                    className="ps-8"
                />
            </div>

            <ReportTableCard<ProductsReportRow>
                title={t("reports.products")}
                columns={columns}
                rows={table.data?.data ?? []}
                meta={table.data?.meta}
                getRowKey={(r) => r.product_id}
                isLoading={table.isPending}
                onPageChange={setPage}
                onExport={() => downloadReportCsv("products", { date_from: window.from, date_to: window.to, q: q || undefined })}
            />
        </div>
    );
}
