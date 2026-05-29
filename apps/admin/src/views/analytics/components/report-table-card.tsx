"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { DataTable } from "#/components/DataTable";
import { Button } from "#/components/ui/button";
import { CardContent, CardHeader, CardRoot, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatNumber } from "#/lib/format";
import { cn } from "#/lib/utils";

export interface TableColumn<T> {
    id: string;
    header: ReactNode;
    cell: (row: T, index: number) => ReactNode;
    className?: string;
}

interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    lastPage: number;
}

interface ReportTableCardProps<T> {
    title: string;
    columns: TableColumn<T>[];
    rows: T[];
    meta?: PaginationMeta;
    getRowKey?: (row: T, index: number) => string | number;
    isLoading?: boolean;
    onPageChange?: (page: number) => void;
    onExport?: () => void;
    /** Footer row rendered under the table (e.g. window totals). */
    footer?: ReactNode;
}

/**
 * Card wrapper around {@link DataTable} for report tables: titled header with a CSV export action,
 * per-load skeleton, a totals footer slot, and prev/next pagination driven by the response meta.
 */
export function ReportTableCard<T>({
    title,
    columns,
    rows,
    meta,
    getRowKey,
    isLoading = false,
    onPageChange,
    onExport,
    footer,
}: ReportTableCardProps<T>) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    const page = meta?.page ?? 1;
    const lastPage = meta?.lastPage ?? 1;

    return (
        <CardRoot>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{title}</CardTitle>
                {onExport !== undefined && (
                    <Button variant="outline" size="sm" onClick={onExport}>
                        <Download className="size-3.5" aria-hidden="true" />
                        {t("export")}
                    </Button>
                )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {isLoading ? (
                    <Skeleton className="h-64 w-full rounded-md" />
                ) : (
                    <>
                        <DataTable<T> columns={columns} rows={rows} getRowKey={getRowKey} emptyState={t("empty")} />
                        {footer}
                        {meta !== undefined && meta.total > 0 && (
                            <div className="flex items-center justify-between text-muted-foreground text-xs">
                                <span>
                                    {t("pageOf", { page: formatNumber(page, locale), total: formatNumber(lastPage, locale) })} ·{" "}
                                    {t("rowsTotal", { total: formatNumber(meta.total, locale) })}
                                </span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page <= 1}
                                        onClick={() => onPageChange?.(page - 1)}
                                    >
                                        {t("prev")}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page >= lastPage}
                                        onClick={() => onPageChange?.(page + 1)}
                                    >
                                        {t("next")}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </CardRoot>
    );
}

/** A muted totals strip rendered beneath a report table's body. */
export function TableTotalsFooter({ children }: { children: ReactNode }) {
    return (
        <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/40 px-4 py-2 text-sm")}>
            {children}
        </div>
    );
}
