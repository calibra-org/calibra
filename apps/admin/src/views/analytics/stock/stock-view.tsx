"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Input } from "#/components/ui/input";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { type StockParams, type StockReportRow, useStockReport } from "#/lib/queries/analytics";
import { cn } from "#/lib/utils";

import { downloadReportCsv } from "../components/export-csv";
import { ReportTableCard, type TableColumn, TableTotalsFooter } from "../components/report-table-card";

const STATUS_TONE: Record<string, StatusTone> = { instock: "success", outofstock: "danger", onbackorder: "warning" };
const STATUS_FILTERS: NonNullable<StockParams["status"]>[] = ["all", "instock", "lowstock", "outofstock", "onbackorder"];

export function StockView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const [page, setPage] = useState(1);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<NonNullable<StockParams["status"]>>("all");
    const report = useStockReport({ page, q: q || undefined, status, orderBy: "name", orderDir: "asc" });
    const num = (v: number) => formatNumber(v, locale);
    const counts = report.data?.counts;

    const columns: TableColumn<StockReportRow>[] = [
        {
            id: "name",
            header: t("table.productVariation"),
            cell: (r) => (
                <Link href={`/products/${r.product_id}` as never} className="text-primary hover:underline">
                    {r.name || "—"}
                </Link>
            ),
        },
        { id: "sku", header: t("table.sku"), cell: (r) => r.sku ?? "—", className: "text-muted-foreground" },
        {
            id: "status",
            header: t("table.status"),
            cell: (r) => (
                <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{t(`stockStatus.${r.status}` as never)}</StatusBadge>
            ),
        },
        {
            id: "stock",
            header: t("table.stock"),
            cell: (r) => (r.stock === null ? t("stockUnknown") : num(r.stock)),
            className: "text-end",
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <h1 className="font-semibold text-xl tracking-tight">{t("reports.stock")}</h1>

            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex h-8 items-center rounded-md border border-input bg-background p-0.5">
                    {STATUS_FILTERS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                setStatus(value);
                                setPage(1);
                            }}
                            className={cn(
                                "inline-flex h-7 items-center rounded-[5px] px-2.5 text-xs transition-colors",
                                status === value
                                    ? "bg-accent font-medium text-accent-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t(`stockFilter.${value}` as never)}
                        </button>
                    ))}
                </div>
                <div className="relative max-w-xs">
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
            </div>

            <ReportTableCard<StockReportRow>
                title={t("reports.stock")}
                columns={columns}
                rows={report.data?.data ?? []}
                meta={report.data?.meta}
                getRowKey={(r) => r.inventory_id}
                isLoading={report.isPending}
                onPageChange={setPage}
                onExport={() => downloadReportCsv("stock", { status, q: q || undefined })}
                footer={
                    counts ? (
                        <TableTotalsFooter>
                            <span>{t("stockCounts.total", { n: num(counts.total) })}</span>
                            <span>{t("stockCounts.instock", { n: num(counts.instock) })}</span>
                            <span>{t("stockCounts.lowstock", { n: num(counts.lowstock) })}</span>
                            <span>{t("stockCounts.outofstock", { n: num(counts.outofstock) })}</span>
                            <span>{t("stockCounts.onbackorder", { n: num(counts.onbackorder) })}</span>
                        </TableTotalsFooter>
                    ) : undefined
                }
            />
        </div>
    );
}
