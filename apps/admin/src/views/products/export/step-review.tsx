"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { ArrowLeft, FileDown, Info, RefreshCw, Sliders } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Spinner } from "#/components/ui/spinner";
import { getExportPreview, startExport } from "#/lib/exports/api";
import type { ExportFormatOptions, ProductExportRow } from "#/lib/exports/types";
import { cn } from "#/lib/utils";

import type { ReviewState } from "./wizard-state";

export interface StepReviewProps {
    state: ReviewState;
    onChange: (next: Partial<ReviewState>) => void;
    onBackToFilter: () => void;
    onStart: (row: ProductExportRow) => void;
}

const PREVIEW_ROW_CAP = 5;

/**
 * Step 2 — dedicated **review** workspace. Mirrors the importer wizard's review pattern: the
 * operator sees the actual 5-row sample the runner would emit + a compact format-tweaking rail
 * + a prominent Generate button.
 *
 * Why we cap at 5 rows: rendering 100k rows in a `<table>` would freeze the browser, and
 * generating the whole file just to throw it away when the operator clicks "back" wastes runner
 * cycles + creates throwaway artifacts on disk. The cap is explained inline next to the preview
 * so operators don't expect a full re-render of their entire catalogue.
 *
 * Format options that affect the OUTPUT (digit_style, date_format, money_format,
 * header_language) auto-refresh the preview when changed. They don't need a server round-trip
 * for the filter set — only the value formatting changes.
 */
export function StepReview({ state, onChange, onBackToFilter, onStart }: StepReviewProps): React.JSX.Element {
    const t = useTranslations("ProductsExport.review");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [previewLoading, setPreviewLoading] = useState(false);
    const [startLoading, setStartLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const skipFirstRefresh = useRef(true);

    const refreshPreview = useCallback(async () => {
        setError(null);
        setPreviewLoading(true);
        try {
            const { data } = await getExportPreview(
                {
                    ...state.filters,
                    columns: state.columns,
                    digit_style: state.format.digit_style,
                    date_format: state.format.date_format,
                    money_format: state.format.money_format,
                    header_language: state.format.header_language,
                },
                locale,
            );
            onChange({ preview: data });
        } catch (err) {
            setError(err instanceof Error ? err.message : t("previewFailed"));
        } finally {
            setPreviewLoading(false);
        }
    }, [
        locale,
        onChange,
        state.columns,
        state.filters,
        state.format.date_format,
        state.format.digit_style,
        state.format.header_language,
        state.format.money_format,
        t,
    ]);

    /**
     * Auto-refresh the preview whenever a value-formatting option changes. Skip the first run
     * (the preview that came in from Step 1 is already correct). The exhaustive-deps lint rule
     * would normally fold these into `refreshPreview`'s callback identity, but doing so creates
     * a refresh storm because `refreshPreview` already depends on the same fields — so we list
     * the formatting fields directly here and ignore the lint hint.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: format fields are the trigger; refreshPreview reads them
    useEffect(() => {
        if (skipFirstRefresh.current) {
            skipFirstRefresh.current = false;
            return;
        }
        void refreshPreview();
    }, [state.format.digit_style, state.format.date_format, state.format.money_format, state.format.header_language]);

    const updateFormat = useCallback(
        (next: Partial<ExportFormatOptions>) => onChange({ format: { ...state.format, ...next } }),
        [onChange, state.format],
    );

    const handleStart = useCallback(async () => {
        setError(null);
        setStartLoading(true);
        try {
            const { data } = await startExport(
                {
                    ...state.filters,
                    columns: state.columns,
                    scope: state.scope,
                    ...state.format,
                },
                locale,
            );
            onStart(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : t("startFailed"));
        } finally {
            setStartLoading(false);
        }
    }, [locale, onStart, state.columns, state.filters, state.format, state.scope, t]);

    return (
        <article className="flex flex-col gap-4">
            <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
                <h2 className="font-semibold text-xl tracking-tight">{t("title")}</h2>
                <p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Stat label={t("totals.products")} value={fmt(state.matchCount.products)} tone="primary" />
                    <Stat
                        label={t("totals.variations")}
                        value={fmt(state.matchCount.variations)}
                        tone={state.matchCount.variations > 0 ? "info" : "muted"}
                    />
                    <Stat label={t("totals.columns")} value={fmt(state.columns.length)} />
                    <Stat label={t("totals.format")} value={(state.format.format ?? "csv").toUpperCase()} tone="muted" />
                </dl>
            </section>

            {error !== null ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                    {error}
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
                <aside className="flex flex-col gap-4">
                    <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
                        <header className="flex items-center gap-2">
                            <Sliders className="size-4 text-muted-foreground" aria-hidden />
                            <h3 className="font-semibold text-base">{t("formatTitle")}</h3>
                        </header>
                        <p className="mt-1 text-muted-foreground text-xs">{t("formatHelp")}</p>
                        <div className="mt-4 flex flex-col gap-3">
                            <SelectField
                                label={t("digitStyle")}
                                value={state.format.digit_style ?? "ascii"}
                                onChange={(v) => updateFormat({ digit_style: v as ExportFormatOptions["digit_style"] })}
                                options={[
                                    { value: "ascii", label: t("digitStyleAscii") },
                                    { value: "persian", label: t("digitStylePersian") },
                                ]}
                            />
                            <SelectField
                                label={t("dateFormat")}
                                value={state.format.date_format ?? "iso"}
                                onChange={(v) => updateFormat({ date_format: v as ExportFormatOptions["date_format"] })}
                                options={[
                                    { value: "iso", label: "ISO 8601" },
                                    { value: "jalali", label: t("jalali") },
                                    { value: "ddmmyyyy", label: "DD/MM/YYYY" },
                                ]}
                            />
                            <SelectField
                                label={t("moneyFormat")}
                                value={state.format.money_format ?? "minor"}
                                onChange={(v) => updateFormat({ money_format: v as ExportFormatOptions["money_format"] })}
                                options={[
                                    { value: "minor", label: t("moneyMinor") },
                                    { value: "major", label: t("moneyMajor") },
                                ]}
                            />
                            <SelectField
                                label={t("headerLanguage")}
                                value={state.format.header_language ?? "en"}
                                onChange={(v) => updateFormat({ header_language: v as ExportFormatOptions["header_language"] })}
                                options={[
                                    { value: "en", label: t("headerEn") },
                                    { value: "fa", label: t("headerFa") },
                                ]}
                            />
                        </div>
                    </section>
                </aside>

                <div className="flex flex-col gap-4">
                    <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-xs">
                        <header className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="font-semibold text-base">{t("previewTitle")}</h3>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {t("previewSubtitle", { rows: fmt(PREVIEW_ROW_CAP) })}
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={refreshPreview} disabled={previewLoading}>
                                {previewLoading ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
                                {t("refresh")}
                            </Button>
                        </header>

                        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-muted-foreground text-xs">
                            <Info className="size-3.5 shrink-0" aria-hidden />
                            <p>
                                {t("previewCapNote", {
                                    rows: fmt(PREVIEW_ROW_CAP),
                                    total: fmt(state.matchCount.total_rows),
                                })}
                            </p>
                        </div>

                        <div className="mt-3 overflow-x-auto rounded-md border">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-muted-foreground">
                                    <tr>
                                        {state.preview.columns.map((c) => (
                                            <th
                                                key={c}
                                                scope="col"
                                                className="whitespace-nowrap px-2 py-1.5 text-start font-medium"
                                            >
                                                {c}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.preview.rows.map((row, idx) => (
                                        // biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no stable identity
                                        <tr key={`preview-${idx}`} className="border-t">
                                            {state.preview.columns.map((c) => (
                                                <td key={c} className="max-w-48 truncate px-2 py-1.5">
                                                    {row[c] ?? ""}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
                        <Button variant="ghost" onClick={onBackToFilter}>
                            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                            {t("backToFilter")}
                        </Button>
                        <Button size="lg" onClick={handleStart} disabled={startLoading || previewLoading}>
                            {startLoading ? <Spinner /> : <FileDown className="size-4" aria-hidden />}
                            {t("generate")}
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}

interface StatProps {
    label: string;
    value: string;
    tone?: "primary" | "info" | "muted";
}

function Stat({ label, value, tone }: StatProps): React.JSX.Element {
    return (
        <div
            className={cn(
                "rounded-md border p-3",
                tone === "primary" && "border-primary/30 bg-primary/5",
                tone === "info" && "border-sky-500/30 bg-sky-500/5",
                tone === "muted" && "bg-muted/30",
            )}
        >
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 truncate font-semibold text-base">{value}</dd>
        </div>
    );
}

function SelectField({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    options: Array<{ value: string; label: string }>;
}): React.JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
