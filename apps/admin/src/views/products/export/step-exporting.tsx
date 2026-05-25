"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { ChevronRight, Loader2, Minimize2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { cancelExport, getExport, streamExport } from "#/lib/exports/api";
import type { ProductExportRow, ProductExportStreamEvent } from "#/lib/exports/types";
import { cn } from "#/lib/utils";

export interface StepExportingProps {
    exportRow: ProductExportRow;
    onFinished: (row: ProductExportRow, token: string | null) => void;
    onBackToList: () => void;
}

const SLOW_CHUNK_THRESHOLD_MS = 5000;
const POLLING_INTERVAL_MS = 1500;

/**
 * Step 2 — live progress for the export run. Mirrors `StepImporting` exactly: SSE primary,
 * polling fallback, slow-chunk indicator after 5s of silence, cancel + background-mode buttons,
 * Notification API permission ask on entry, terminal-event → `onFinished` hand-off.
 *
 * Captures the signed-URL `token` from the runner's `complete` event so Step 3 has it for the
 * download link — the token is never stored on the DB row in plaintext, only its hash.
 */
export function StepExporting({ exportRow, onFinished, onBackToList }: StepExportingProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.exporting");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [row, setRow] = useState<ProductExportRow>(exportRow);
    const [streamOpen, setStreamOpen] = useState(false);
    const [pollingActive, setPollingActive] = useState(false);
    const [lastEventAt, setLastEventAt] = useState<number>(Date.now());
    const [slow, setSlow] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const tokenRef = useRef<string | null>(null);
    const finishedRef = useRef(false);

    useEffect(() => {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission();
        }
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: see end-of-effect note
    useEffect(() => {
        if (finishedRef.current) return;
        let cancelled = false;

        const finalize = async () => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            try {
                const response = await getExport(exportRow.id, locale);
                if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                    new Notification(deriveNotificationTitle(response.data.status), {
                        body: deriveNotificationBody(response.data),
                    });
                }
                /**
                 * Prefer the token from the SSE complete event (already in `tokenRef`); fall
                 * back to the freshly minted one the /show endpoint hands back when SSE was
                 * missed (operator refreshed mid-stream, came back from a deep-link, etc.).
                 */
                onFinished(response.data, tokenRef.current ?? response.download_token);
            } catch {
                /** Last-ditch fallback when the GET also fails — hand back the initial row. */
                onFinished(exportRow, tokenRef.current);
            }
        };

        const applyEvent = (event: ProductExportStreamEvent) => {
            setLastEventAt(Date.now());
            setSlow(false);
            if (event.type === "reading_products" || event.type === "chunk_start" || event.type === "chunk_complete") {
                const p = event.payload;
                setRow((current) => ({
                    ...current,
                    status: p?.status ?? current.status,
                    processed_rows: p?.processed ?? current.processed_rows,
                    total_rows: p?.total ?? p?.total_products ?? current.total_rows,
                }));
                return;
            }
            if (event.type === "complete") {
                tokenRef.current = (event.payload?.token as string | undefined) ?? null;
                void finalize();
                return;
            }
            if (event.type === "failed" || event.type === "cancelled") {
                void finalize();
            }
        };

        /**
         * Reconcile against the row's true backend state before opening SSE. Without this,
         * a wizard that mounts on a row whose terminal event already fired (operator
         * refreshed mid-run, came back from a deep-link, api/queue worker was restarted
         * mid-run and the terminal broadcast was lost) sits forever on the in-progress
         * screen — SSE only delivers events that occur *after* it subscribes.
         */
        void (async () => {
            try {
                const response = await getExport(exportRow.id, locale);
                if (cancelled || finishedRef.current) return;
                setRow(response.data);
                if (
                    response.data.status === "completed" ||
                    response.data.status === "completed_with_errors" ||
                    response.data.status === "failed" ||
                    response.data.status === "cancelled"
                ) {
                    finishedRef.current = true;
                    onFinished(response.data, tokenRef.current ?? response.download_token);
                }
            } catch {
                /** GET failure isn't fatal — SSE / polling will recover. */
            }
        })();

        const unsubscribe = streamExport(exportRow.id, {
            onOpen: () => {
                if (cancelled) return;
                setStreamOpen(true);
                setPollingActive(false);
            },
            onError: () => {
                if (cancelled) return;
                setStreamOpen(false);
                setPollingActive(true);
            },
            onEvent: (event) => {
                if (cancelled) return;
                applyEvent(event);
            },
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
        /**
         * Intentionally omit `row` from deps — including it tears the SSE down + re-opens it
         * on every progress update, which guarantees event loss between unsubscribe and
         * resubscribe. The handlers reach `row` via `setRow((current) => …)` instead, and the
         * catch-fallback inside `finalize()` uses the immutable `exportRow` prop.
         */
    }, [exportRow, locale, onFinished]);

    useEffect(() => {
        if (!pollingActive || finishedRef.current) return;
        const interval = setInterval(() => {
            getExport(exportRow.id, locale)
                .then((response) => {
                    setRow(response.data);
                    setLastEventAt(Date.now());
                    setSlow(false);
                    if (
                        response.data.status === "completed" ||
                        response.data.status === "completed_with_errors" ||
                        response.data.status === "failed" ||
                        response.data.status === "cancelled"
                    ) {
                        if (!finishedRef.current) {
                            finishedRef.current = true;
                            onFinished(response.data, tokenRef.current ?? response.download_token);
                        }
                    }
                })
                .catch(() => undefined);
        }, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [pollingActive, exportRow.id, locale, onFinished]);

    useEffect(() => {
        if (finishedRef.current) return;
        const timer = setInterval(() => {
            if (Date.now() - lastEventAt > SLOW_CHUNK_THRESHOLD_MS) setSlow(true);
        }, 1000);
        return () => clearInterval(timer);
    }, [lastEventAt]);

    const handleCancel = useCallback(async () => {
        setCancelling(true);
        try {
            await cancelExport(exportRow.id, locale);
        } finally {
            setCancelling(false);
        }
    }, [exportRow.id, locale]);

    const percent = row.total_rows === 0 ? 0 : Math.min(100, Math.round((row.processed_rows / row.total_rows) * 100));

    return (
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-semibold text-xl">{t("title")}</h2>
                    <p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <ConnectionPill state={streamOpen ? "sse" : pollingActive ? "polling" : "connecting"} />
            </header>

            <section className="mt-6">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground text-sm">
                        {t("processedOfTotal", { processed: fmt(row.processed_rows), total: fmt(row.total_rows) })}
                    </span>
                    <span className="font-semibold text-2xl">{fmt(percent)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                </div>
                {slow ? (
                    <p className="mt-2 flex items-center gap-2 text-amber-600 text-xs dark:text-amber-300">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        {t("slowChunk", { row: fmt(row.processed_rows + 1) })}
                    </p>
                ) : null}
            </section>

            <footer className="mt-6 flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? <Spinner /> : <X className="size-4" aria-hidden />}
                    {t("cancel")}
                </Button>
                <Button variant="outline" size="sm" onClick={onBackToList}>
                    <Minimize2 className="size-4" aria-hidden />
                    {t("background")}
                    <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                </Button>
            </footer>
        </article>
    );
}

function ConnectionPill({ state }: { state: "sse" | "polling" | "connecting" }): React.JSX.Element {
    const t = useTranslations("ProductsExport.exporting.connection");
    const color = state === "sse" ? "bg-emerald-500" : state === "polling" ? "bg-amber-500" : "bg-muted-foreground";
    return (
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <span className={cn("size-1.5 rounded-full", color)} aria-hidden />
            {t(state)}
        </span>
    );
}

function deriveNotificationTitle(status: string): string {
    if (status === "completed") return "خروجی محصولات آماده شد";
    if (status === "failed") return "گرفتن خروجی ناموفق بود";
    if (status === "cancelled") return "گرفتن خروجی لغو شد";
    return "وضعیت خروجی";
}

function deriveNotificationBody(row: ProductExportRow): string {
    return `${row.processed_rows} ردیف · ${(row.file_size_bytes / 1024).toFixed(1)} KB`;
}
