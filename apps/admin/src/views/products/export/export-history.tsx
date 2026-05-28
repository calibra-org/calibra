"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { ArrowLeft, Download, History as HistoryIcon, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { deleteExport, exportDownloadUrl, getExport, listExportHistory } from "#/lib/exports/api";
import type { ProductExportRow } from "#/lib/exports/types";
import { Link, useRouter } from "#/lib/i18n/navigation";

/**
 * Export history list. Per-row actions: download (when still within the 24h window),
 * delete-from-history (drops the file + row). Mirrors `ImportHistory` shape so the two pages
 * feel like siblings.
 *
 * Re-run isn't implemented as a button here yet — to re-run with the same filters, the operator
 * navigates back to `/products/export` (the wizard accepts a `?id=` deep-link to resume on an
 * in-flight job, but a "re-run with same filters" deep-link would need a separate query-string
 * carrier — tracked as follow-up debt).
 */
export function ExportHistory(): React.JSX.Element {
    const t = useTranslations("ProductsExport.history");
    const tDone = useTranslations("ProductsExport.done");
    const locale = useLocale();
    const router = useRouter();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [rows, setRows] = useState<ProductExportRow[] | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await listExportHistory(locale, { limit: 50 });
            setRows(data);
        } finally {
            setLoading(false);
        }
    }, [locale]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleDelete = useCallback(
        async (id: number) => {
            await deleteExport(id, locale);
            await load();
        },
        [load, locale],
    );

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit text-muted-foreground"
                    onClick={() => router.push("/products" as never)}
                >
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
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("col.file")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("col.date")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("col.status")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("col.rows")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("col.size")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-end font-medium">
                                    {t("col.actions")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-t hover:bg-muted/30">
                                    <td className="px-3 py-2 font-medium">
                                        <Link href={`/products/export?id=${row.id}` as never} className="hover:underline">
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
                                    <td className="px-3 py-2">{fmt(row.processed_rows)}</td>
                                    <td className="px-3 py-2">{formatBytes(row.file_size_bytes, fmt)}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                            {row.is_downloadable ? (
                                                /**
                                                 * Click hands off to `getExport` to mint a fresh
                                                 * signed-URL token, then triggers a hidden `<a>`
                                                 * with the resulting URL. We don't keep tokens in
                                                 * memory between visits, so each download is a
                                                 * single round-trip.
                                                 */
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={t("col.download")}
                                                    onClick={async () => {
                                                        const response = await getExport(row.id, locale);
                                                        if (response.download_token === null) return;
                                                        const url = exportDownloadUrl(row.id, response.download_token);
                                                        const link = document.createElement("a");
                                                        link.href = url;
                                                        link.download = row.compressed
                                                            ? `${row.original_filename}.gz`
                                                            : row.original_filename;
                                                        document.body.appendChild(link);
                                                        link.click();
                                                        link.remove();
                                                    }}
                                                >
                                                    <Download className="size-4" aria-hidden />
                                                </Button>
                                            ) : null}
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={t("col.delete")}
                                                onClick={() => handleDelete(row.id)}
                                            >
                                                <Trash2 className="size-4 text-destructive" aria-hidden />
                                            </Button>
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

function statusVariant(status: ProductExportRow["status"]): "default" | "secondary" | "destructive" | "outline" {
    if (status === "completed") return "default";
    if (status === "completed_with_errors") return "secondary";
    if (status === "failed") return "destructive";
    return "outline";
}

function formatBytes(bytes: number, fmt: (n: number) => string): string {
    if (bytes < 1024) return `${fmt(bytes)} B`;
    if (bytes < 1024 * 1024) return `${fmt(Math.round(bytes / 102.4) / 10)} KB`;
    return `${fmt(Math.round(bytes / 1024 / 102.4) / 10)} MB`;
}
