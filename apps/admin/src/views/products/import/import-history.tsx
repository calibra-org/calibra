"use client";

import { ArrowLeft, Download, History as HistoryIcon, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { toPersianDigits } from "@calibra/shared/digits";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { importErrorReportUrl, listImportHistory, rollbackImport } from "#/lib/imports/api";
import type { ProductImportRow } from "#/lib/imports/types";
import { cn } from "#/lib/utils";

/**
 * Import history page. Lists every CSV import the operator has run (any user — admins can see all
 * imports). Per-row actions: jump back to Step 4 (`/products/import?id=<id>`), download the error
 * report, rollback if still within the 24h window.
 */
export function ImportHistory(): React.JSX.Element {
    const t = useTranslations("ProductsImport.history");
    const tDone = useTranslations("ProductsImport.done");
    const locale = useLocale();
    const router = useRouter();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [rows, setRows] = useState<ProductImportRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [rollbackingId, setRollbackingId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await listImportHistory(locale, { perPage: 50 });
            setRows(response.data);
        } finally {
            setLoading(false);
        }
    }, [locale]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleRollback = useCallback(
        async (row: ProductImportRow) => {
            setRollbackingId(row.id);
            try {
                await rollbackImport(row.id, locale);
                await load();
            } finally {
                setRollbackingId(null);
            }
        },
        [load, locale],
    );

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
                <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => router.push("/products" as never)}>
                    <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                    {t("backToProducts")}
                </Button>
                <div className="flex items-center gap-2">
                    <HistoryIcon className="size-5 text-muted-foreground" aria-hidden />
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                </div>
                <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
            </header>

            {loading ? (
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
            ) : rows === null || rows.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/30 p-12 text-center text-muted-foreground text-sm">
                    {t("empty")}
                </div>
            ) : (
                <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.file")}</th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.date")}</th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.status")}</th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.created")}</th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.updated")}</th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.skipped")}</th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">{t("col.failed")}</th>
                                <th scope="col" className="px-3 py-2 text-end font-medium">{t("col.actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-t hover:bg-muted/30">
                                    <td className="px-3 py-2 font-medium">
                                        <Link href={`/products/import?id=${row.id}` as never} className="hover:underline">
                                            {row.original_filename}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {row.created_at !== null ? new Date(row.created_at).toLocaleString(locale) : "—"}
                                    </td>
                                    <td className="px-3 py-2">
                                        <Badge variant={statusVariant(row.status)} className="text-[10px]">
                                            {tDone(`headline.${row.status}`)}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-2">{fmt(row.created_count)}</td>
                                    <td className="px-3 py-2">{fmt(row.updated_count)}</td>
                                    <td className="px-3 py-2">{fmt(row.skipped_count)}</td>
                                    <td className={cn("px-3 py-2", row.failed_count > 0 && "text-destructive")}>
                                        {fmt(row.failed_count)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                            {row.has_error_report ? (
                                                <Button asChild size="icon" variant="ghost" aria-label={t("col.download")}>
                                                    <a href={importErrorReportUrl(row.id)} download>
                                                        <Download className="size-4" aria-hidden />
                                                    </a>
                                                </Button>
                                            ) : null}
                                            {row.is_rollback_eligible ? (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={t("col.rollback")}
                                                    onClick={() => handleRollback(row)}
                                                    disabled={rollbackingId === row.id}
                                                >
                                                    <RotateCcw className="size-4" aria-hidden />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function statusVariant(status: ProductImportRow["status"]): "default" | "secondary" | "destructive" | "outline" {
    if (status === "completed") return "default";
    if (status === "completed_with_errors") return "secondary";
    if (status === "failed" || status === "rolled_back") return "destructive";
    return "outline";
}
