"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    History,
    PackagePlus,
    RefreshCw,
    Repeat,
    RotateCcw,
    Undo2,
    XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { Link } from "#/lib/i18n/navigation";
import { importErrorReportUrl, listImportErrors, retryFailedImport, retryImportRow, rollbackImport } from "#/lib/imports/api";
import type { ProductImportErrorRow, ProductImportRow } from "#/lib/imports/types";
import { cn } from "#/lib/utils";

export interface StepDoneProps {
    importRow: ProductImportRow;
    onAnother: () => void;
    onBackToList: () => void;
}

const FIRST_ERRORS_PAGE_SIZE = 50;

/**
 * Step 4 — final summary card + collapsible error panel with editable retry rows + undo banner.
 *
 * The undo banner is hidden when the import is older than 24h or has already been rolled back;
 * the row's `is_rollback_eligible` flag computed by the transformer drives the call.
 */
export function StepDone({ importRow, onAnother, onBackToList }: StepDoneProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.done");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [row, setRow] = useState<ProductImportRow>(importRow);
    const [errors, setErrors] = useState<ProductImportErrorRow[]>([]);
    const [errorsLoaded, setErrorsLoaded] = useState(false);
    const [edits, setEdits] = useState<Record<number, string>>({});
    const [rollbackPending, setRollbackPending] = useState(false);
    const [rollbackError, setRollbackError] = useState<string | null>(null);
    const [retryAllPending, setRetryAllPending] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (row.failed_count + row.skipped_count === 0) {
            setErrorsLoaded(true);
            return;
        }
        listImportErrors(row.id, locale, { perPage: FIRST_ERRORS_PAGE_SIZE })
            .then((response) => {
                if (cancelled) return;
                setErrors(response.data);
                const initialEdits: Record<number, string> = {};
                for (const err of response.data) initialEdits[err.id] = err.original_value ?? "";
                setEdits(initialEdits);
            })
            .finally(() => {
                if (!cancelled) setErrorsLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [locale, row.failed_count, row.id, row.skipped_count]);

    const handleRollback = useCallback(async () => {
        setRollbackError(null);
        setRollbackPending(true);
        try {
            const response = await rollbackImport(row.id, locale);
            setRow(response.data);
        } catch (err) {
            setRollbackError(err instanceof Error ? err.message : t("rollbackFailed"));
        } finally {
            setRollbackPending(false);
        }
    }, [locale, row.id, t]);

    const handleRetryRow = useCallback(
        async (errorRow: ProductImportErrorRow) => {
            const value = edits[errorRow.id] ?? errorRow.original_value ?? "";
            try {
                const response = await retryImportRow(
                    row.id,
                    { error_id: errorRow.id, value: value === "" ? null : value },
                    locale,
                );
                setErrors((current) => current.map((e) => (e.id === errorRow.id ? response.data : e)));
            } catch {
                /** Surface inline error in a future iteration; for now silently fail. */
            }
        },
        [edits, locale, row.id],
    );

    const handleRetryAll = useCallback(async () => {
        setRetryAllPending(true);
        try {
            await retryFailedImport(
                row.id,
                {
                    edits: errors.map((e) => ({
                        error_id: e.id,
                        value: (edits[e.id] ?? e.original_value ?? "") === "" ? null : (edits[e.id] ?? e.original_value),
                    })),
                },
                locale,
            );
        } finally {
            setRetryAllPending(false);
        }
    }, [edits, errors, locale, row.id]);

    const statusTone = useMemo(() => statusToTone(row.status), [row.status]);
    const StatusIcon = useMemo(() => statusToIcon(row.status), [row.status]);

    const showRollback = row.is_rollback_eligible && row.status !== "rolled_back";
    const wasRolledBack = row.status === "rolled_back";

    return (
        <article className="flex flex-col gap-4">
            <section className={cn("rounded-lg border bg-card p-6 text-card-foreground shadow-xs", statusTone.border)}>
                <header className="flex items-start gap-3">
                    <StatusIcon className={cn("size-6 shrink-0", statusTone.icon)} aria-hidden />
                    <div className="flex-1">
                        <h2 className="font-semibold text-xl">{t(`headline.${row.status}`)}</h2>
                        <p className="mt-1 text-muted-foreground text-sm">{row.original_filename}</p>
                    </div>
                    {wasRolledBack ? <Badge variant="destructive">{t("status.rolled_back")}</Badge> : null}
                </header>

                <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Stat label={t("totals.totalRows")} value={fmt(row.total_rows)} />
                    <Stat label={t("totals.created")} value={fmt(row.created_count)} icon="✓" tone="success" />
                    <Stat label={t("totals.updated")} value={fmt(row.updated_count)} icon="↻" tone="info" />
                    <Stat label={t("totals.skipped")} value={fmt(row.skipped_count)} icon="⊘" tone="muted" />
                    <Stat label={t("totals.failed")} value={fmt(row.failed_count)} icon="✗" tone="danger" />
                    <Stat label={t("totals.newCategories")} value={fmt(row.new_categories_count)} />
                    <Stat label={t("totals.newTags")} value={fmt(row.new_tags_count)} />
                    <Stat label={t("totals.queuedImages")} value={fmt(row.queued_images_count)} />
                    <Stat label={t("totals.duration")} value={computeDuration(row)} />
                </dl>
            </section>

            {showRollback ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
                    <p className="flex items-center gap-2 text-warning dark:text-warning">
                        <Undo2 className="size-4" aria-hidden />
                        {t("rollback.banner")}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRollback} disabled={rollbackPending}>
                        {rollbackPending ? <Spinner /> : <RotateCcw className="size-4" aria-hidden />}
                        {t("rollback.cta")}
                    </Button>
                </div>
            ) : null}
            {wasRolledBack ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
                    {t("rollback.afterMessage", { at: row.rolled_back_at ?? "" })}
                </div>
            ) : null}
            {rollbackError !== null ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                    {rollbackError}
                </div>
            ) : null}

            {errors.length > 0 ? (
                <section className="rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
                    <header className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold text-lg">{t("errors.title")}</h3>
                        <div className="flex items-center gap-2">
                            <Button asChild size="sm" variant="outline">
                                <a href={importErrorReportUrl(row.id)} download>
                                    <Download className="size-4" aria-hidden />
                                    {t("errors.download")}
                                </a>
                            </Button>
                            {row.failed_count > 0 ? (
                                <Button size="sm" onClick={handleRetryAll} disabled={retryAllPending}>
                                    {retryAllPending ? <Spinner /> : <Repeat className="size-4" aria-hidden />}
                                    {t("errors.retryAll")}
                                </Button>
                            ) : null}
                        </div>
                    </header>

                    <ul className="mt-4 space-y-2">
                        {errors.map((err) => (
                            <li key={err.id} className="rounded-md border p-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={err.severity === "error" ? "destructive" : "outline"} className="text-xs">
                                            {t(`severity.${err.severity}`)}
                                        </Badge>
                                        <span className="font-mono text-sm">{err.sku ?? "—"}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {t("errors.rowLabel", { n: fmt(err.row_number) })}
                                        </span>
                                        {err.column_name !== null ? (
                                            <span className="text-muted-foreground text-xs">· {err.column_name}</span>
                                        ) : null}
                                    </div>
                                    {err.retried_at !== null ? (
                                        <Badge variant="outline" className="text-success text-xs dark:text-success">
                                            {t("errors.retried")}
                                        </Badge>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-sm">{err.message}</p>
                                {err.column_name !== null ? (
                                    <div className="mt-2 flex items-center gap-2">
                                        <Input
                                            value={edits[err.id] ?? err.original_value ?? ""}
                                            onChange={(e) => setEdits((current) => ({ ...current, [err.id]: e.target.value }))}
                                            className="h-8 max-w-xs text-sm"
                                            disabled={err.retried_at !== null}
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleRetryRow(err)}
                                            disabled={err.retried_at !== null}
                                        >
                                            <RefreshCw className="size-4" aria-hidden />
                                            {t("errors.retryRow")}
                                        </Button>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            {!errorsLoaded && (row.failed_count > 0 || row.skipped_count > 0) ? (
                <div className="rounded-md border bg-muted/30 p-4 text-center text-muted-foreground text-sm">
                    <Spinner /> {t("errors.loading")}
                </div>
            ) : null}

            <footer className="flex flex-wrap items-center justify-end gap-2">
                <Button onClick={onBackToList}>
                    <PackagePlus className="size-4" aria-hidden />
                    {t("actions.viewProducts")}
                </Button>
                <Button variant="outline" onClick={onAnother}>
                    {t("actions.importAnother")}
                </Button>
                <Button asChild variant="ghost">
                    <Link href={"/products/import/history" as never}>
                        <History className="size-4" aria-hidden />
                        {t("actions.history")}
                    </Link>
                </Button>
            </footer>
        </article>
    );
}

function statusToTone(status: ProductImportRow["status"]): { border: string; icon: string } {
    if (status === "completed") return { border: "border-success/30", icon: "text-success" };
    if (status === "completed_with_errors") return { border: "border-warning/30", icon: "text-warning" };
    if (status === "failed") return { border: "border-destructive/30", icon: "text-destructive" };
    if (status === "cancelled") return { border: "border-muted-foreground/30", icon: "text-muted-foreground" };
    if (status === "rolled_back") return { border: "border-destructive/30", icon: "text-destructive" };
    return { border: "border-muted-foreground/30", icon: "text-muted-foreground" };
}

function statusToIcon(status: ProductImportRow["status"]) {
    if (status === "completed") return CheckCircle2;
    if (status === "completed_with_errors") return AlertTriangle;
    if (status === "failed") return XCircle;
    return CheckCircle2;
}

function computeDuration(row: ProductImportRow): string {
    if (row.started_at === null || row.finished_at === null) return "—";
    const startMs = new Date(row.started_at).getTime();
    const endMs = new Date(row.finished_at).getTime();
    const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
}

interface StatProps {
    label: string;
    value: string;
    icon?: string;
    tone?: "success" | "info" | "muted" | "danger";
}

function Stat({ label, value, icon, tone }: StatProps): React.JSX.Element {
    return (
        <div
            className={cn(
                "rounded-md border p-3",
                tone === "success" && "border-success/30 bg-success/5",
                tone === "info" && "border-info/30 bg-info/5",
                tone === "danger" && "border-destructive/30 bg-destructive/5",
            )}
        >
            <dt className="flex items-center gap-2 text-muted-foreground text-xs">
                {icon !== undefined ? <span aria-hidden>{icon}</span> : null}
                <span>{label}</span>
            </dt>
            <dd className="mt-1 font-semibold text-xl">{value}</dd>
        </div>
    );
}
