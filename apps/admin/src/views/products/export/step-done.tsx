"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { CheckCircle2, Copy, Download, FilePlus, History as HistoryIcon, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { exportDownloadUrl } from "#/lib/exports/api";
import type { ProductExportRow } from "#/lib/exports/types";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

export interface StepDoneProps {
    exportRow: ProductExportRow;
    token: string | null;
    onAnother: () => void;
    onBackToList: () => void;
}

/**
 * Step 3 — summary card + download / copy-link / save-as-preset / re-run actions. The download
 * link is the signed URL the runner minted; valid for 24h, then the file is purged and the link
 * 410s (the summary shows a "no longer available" banner with a "re-run" CTA in that case).
 */
export function StepDone({ exportRow, token, onAnother, onBackToList }: StepDoneProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.done");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [copied, setCopied] = useState(false);

    const downloadUrl = useMemo(() => {
        if (token === null) return null;
        return exportDownloadUrl(exportRow.id, token);
    }, [exportRow.id, token]);

    const handleCopyLink = useCallback(() => {
        if (downloadUrl === null || typeof navigator === "undefined") return;
        const absolute = `${window.location.origin}${downloadUrl}`;
        navigator.clipboard.writeText(absolute).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [downloadUrl]);

    const sizeLabel = formatBytes(exportRow.file_size_bytes, fmt);
    const StatusIcon = exportRow.status === "completed" ? CheckCircle2 : XCircle;
    const statusTone = exportRow.status === "completed" ? "text-emerald-500" : "text-destructive";

    return (
        <article className="flex flex-col gap-4">
            <section className={cn("rounded-lg border bg-card p-6 text-card-foreground shadow-xs")}>
                <header className="flex items-start gap-3">
                    <StatusIcon className={cn("size-6 shrink-0", statusTone)} aria-hidden />
                    <div className="flex-1">
                        <h2 className="font-semibold text-xl">{t(`headline.${exportRow.status}`)}</h2>
                        <p className="mt-1 text-muted-foreground text-sm">{exportRow.original_filename}</p>
                    </div>
                    {exportRow.compressed ? (
                        <Badge variant="outline" className="text-emerald-700 text-xs dark:text-emerald-300">
                            gzip
                        </Badge>
                    ) : null}
                </header>

                <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    <Stat label={t("file")} value={exportRow.original_filename} />
                    <Stat label={t("size")} value={sizeLabel} />
                    <Stat label={t("rows")} value={fmt(exportRow.processed_rows)} />
                    <Stat label={t("columns")} value={fmt(exportRow.columns.length)} />
                    <Stat label={t("duration")} value={computeDuration(exportRow)} />
                    <Stat label={t("scope")} value={t(`scope.${exportRow.scope}`)} />
                </dl>

                {exportRow.is_downloadable && downloadUrl !== null ? (
                    <div className="mt-6 flex flex-wrap items-center gap-2">
                        <Button asChild size="lg">
                            <a
                                href={downloadUrl}
                                download={
                                    exportRow.compressed ? `${exportRow.original_filename}.gz` : exportRow.original_filename
                                }
                            >
                                <Download className="size-4" aria-hidden />
                                {t("download")}
                            </a>
                        </Button>
                        <Button variant="outline" onClick={handleCopyLink}>
                            <Copy className="size-4" aria-hidden />
                            {copied ? t("copied") : t("copyLink")}
                        </Button>
                    </div>
                ) : exportRow.status === "completed" ? (
                    <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-amber-900 text-sm dark:text-amber-100">
                        {t("noLongerAvailable")}
                    </div>
                ) : null}
            </section>

            <footer className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={onAnother}>
                    <FilePlus className="size-4" aria-hidden />
                    {t("rerun")}
                </Button>
                <Button asChild variant="ghost">
                    <Link href={"/products/export/history" as never}>
                        <HistoryIcon className="size-4" aria-hidden />
                        {t("history")}
                    </Link>
                </Button>
                <Button variant="ghost" onClick={onBackToList}>
                    {t("backToProducts")}
                </Button>
            </footer>
        </article>
    );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
        <div className="rounded-md border bg-muted/30 p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 truncate font-semibold text-sm">{value}</dd>
        </div>
    );
}

function formatBytes(bytes: number, fmt: (n: number) => string): string {
    if (bytes < 1024) return `${fmt(bytes)} B`;
    if (bytes < 1024 * 1024) return `${fmt(Math.round(bytes / 102.4) / 10)} KB`;
    return `${fmt(Math.round(bytes / 1024 / 102.4) / 10)} MB`;
}

function computeDuration(row: ProductExportRow): string {
    if (row.started_at === null || row.finished_at === null) return "—";
    const seconds = Math.max(0, Math.round((new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const r = seconds % 60;
    return `${m}m ${r}s`;
}
