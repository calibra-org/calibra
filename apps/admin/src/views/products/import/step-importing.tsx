"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { Bell, ChevronRight, Loader2, Minimize2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { cancelImport, getImport, streamImport } from "#/lib/imports/api";
import type { ProductImportRow, ProductImportStreamEvent } from "#/lib/imports/types";
import { cn } from "#/lib/utils";

export interface StepImportingProps {
    importRow: ProductImportRow;
    onFinished: (importRow: ProductImportRow) => void;
    onBackToList: () => void;
}

const SLOW_CHUNK_THRESHOLD_MS = 5000;
const POLLING_INTERVAL_MS = 1500;

/**
 * Step 3 — live progress UI fed by the SSE stream (with polling fallback if the stream errors).
 * Owns the slow-chunk indicator, the cancel + background-mode buttons, and the Notification API
 * permission prompt on entry. Calls `onFinished(row)` once a terminal event lands so the wizard
 * jumps to Step 4.
 */
export function StepImporting({ importRow, onFinished, onBackToList }: StepImportingProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.importing");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [row, setRow] = useState<ProductImportRow>(importRow);
    const [streamOpen, setStreamOpen] = useState(false);
    const [pollingActive, setPollingActive] = useState(false);
    const [lastEventAt, setLastEventAt] = useState<number>(Date.now());
    const [slow, setSlow] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
    const [cancelling, setCancelling] = useState(false);

    const finishedRef = useRef(false);

    /** Ask for notification permission on Step 3 entry — only once, only if not yet granted. */
    useEffect(() => {
        if (typeof Notification === "undefined") {
            setNotificationPermission("unsupported");
            return;
        }
        setNotificationPermission(Notification.permission);
        if (Notification.permission === "default") {
            void Notification.requestPermission().then((perm) => setNotificationPermission(perm));
        }
    }, []);

    /** Open SSE stream. */
    useEffect(() => {
        if (finishedRef.current) return;
        let cancelled = false;

        const finalize = async () => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            try {
                const { data } = await getImport(importRow.id, locale);
                if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                    new Notification(deriveNotificationTitle(data.status), {
                        body: deriveNotificationBody(data),
                    });
                }
                onFinished(data);
            } catch {
                onFinished(row);
            }
        };

        const applyEvent = (event: ProductImportStreamEvent) => {
            setLastEventAt(Date.now());
            setSlow(false);
            if (event.type === "progress" || event.type === "chunk_start" || event.type === "chunk_complete") {
                const p = event.payload;
                setRow((current) => ({
                    ...current,
                    status: p?.status ?? current.status,
                    processed_rows: p?.processed ?? current.processed_rows,
                    total_rows: p?.total ?? current.total_rows,
                    created_count: p?.created ?? current.created_count,
                    updated_count: p?.updated ?? current.updated_count,
                    skipped_count: p?.skipped ?? current.skipped_count,
                    failed_count: p?.failed ?? current.failed_count,
                }));
                return;
            }
            if (
                event.type === "complete" ||
                event.type === "failed" ||
                event.type === "cancelled" ||
                event.type === "rolled_back"
            ) {
                void finalize();
            }
        };

        const unsubscribe = streamImport(importRow.id, {
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
    }, [importRow.id, locale, onFinished, row]);

    /** Polling fallback. */
    useEffect(() => {
        if (!pollingActive || finishedRef.current) return;
        const interval = setInterval(() => {
            getImport(importRow.id, locale)
                .then(({ data }) => {
                    setRow(data);
                    setLastEventAt(Date.now());
                    setSlow(false);
                    if (
                        data.status === "completed" ||
                        data.status === "completed_with_errors" ||
                        data.status === "failed" ||
                        data.status === "cancelled" ||
                        data.status === "rolled_back"
                    ) {
                        if (!finishedRef.current) {
                            finishedRef.current = true;
                            onFinished(data);
                        }
                    }
                })
                .catch(() => {
                    /** Network blip — keep polling. */
                });
        }, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [pollingActive, importRow.id, locale, onFinished]);

    /** Slow-chunk indicator: if no event lands within 5s, surface a soft hint. */
    useEffect(() => {
        if (finishedRef.current) return;
        const timer = setInterval(() => {
            if (Date.now() - lastEventAt > SLOW_CHUNK_THRESHOLD_MS) {
                setSlow(true);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [lastEventAt]);

    const handleCancel = useCallback(async () => {
        setCancelling(true);
        try {
            await cancelImport(importRow.id, locale);
        } finally {
            setCancelling(false);
        }
    }, [importRow.id, locale]);

    const percent = row.total_rows === 0 ? 0 : Math.min(100, Math.round((row.processed_rows / row.total_rows) * 100));

    return (
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
            <header className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-semibold text-xl">{t("title")}</h2>
                    <p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    {streamOpen ? (
                        <ConnectionPill state="sse" />
                    ) : pollingActive ? (
                        <ConnectionPill state="polling" />
                    ) : (
                        <ConnectionPill state="connecting" />
                    )}
                </div>
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

            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Counter label={t("created")} value={fmt(row.created_count)} tone="success" />
                <Counter label={t("updated")} value={fmt(row.updated_count)} tone="info" />
                <Counter label={t("skipped")} value={fmt(row.skipped_count)} tone="muted" />
                <Counter label={t("failed")} value={fmt(row.failed_count)} tone="danger" />
            </dl>

            {notificationPermission === "default" || notificationPermission === "denied" ? (
                <p className="mt-4 flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-muted-foreground text-xs">
                    <Bell className="size-4" aria-hidden />
                    {notificationPermission === "denied" ? t("notificationDenied") : t("notificationAsk")}
                </p>
            ) : null}

            <footer className="mt-6 flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                    <X className="size-4" aria-hidden />
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

function deriveNotificationTitle(status: string): string {
    if (status === "completed") return "وارد کردن با موفقیت انجام شد";
    if (status === "completed_with_errors") return "وارد کردن با هشدار به پایان رسید";
    if (status === "failed") return "وارد کردن ناموفق بود";
    if (status === "cancelled") return "وارد کردن لغو شد";
    return "وضعیت وارد کردن";
}

function deriveNotificationBody(row: ProductImportRow): string {
    return `${row.created_count} ساخته شد · ${row.updated_count} به‌روزرسانی شد · ${row.failed_count} ناموفق`;
}

function Counter({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: "success" | "info" | "muted" | "danger";
}): React.JSX.Element {
    return (
        <div
            className={cn(
                "rounded-md border p-3",
                tone === "success" && "border-emerald-500/30 bg-emerald-500/5",
                tone === "info" && "border-sky-500/30 bg-sky-500/5",
                tone === "muted" && "bg-muted/30",
                tone === "danger" && "border-destructive/30 bg-destructive/5",
            )}
        >
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-semibold text-xl">{value}</dd>
        </div>
    );
}

function ConnectionPill({ state }: { state: "sse" | "polling" | "connecting" }): React.JSX.Element {
    const t = useTranslations("ProductsImport.importing.connection");
    const label = t(state);
    const color = state === "sse" ? "bg-emerald-500" : state === "polling" ? "bg-amber-500" : "bg-muted-foreground";
    return (
        <span className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", color)} aria-hidden />
            {label}
        </span>
    );
}
