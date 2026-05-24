"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { ArrowLeft, Play, RefreshCw, Sliders } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { Spinner } from "#/components/ui/spinner";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { previewImport, startImport } from "#/lib/imports/api";
import type { ProductImportRow } from "#/lib/imports/types";
import { cn } from "#/lib/utils";

import { PreviewPane } from "./preview-pane";
import type { ReviewControls, ReviewState } from "./wizard-state";

export interface StepReviewProps {
    state: ReviewState;
    onChange: (next: Partial<ReviewState>) => void;
    onBackToMapping: () => void;
    onStart: (importRow: ProductImportRow) => void;
}

/**
 * Step 3 — dedicated **review** workspace. This is the deliberate divergence from WooCommerce's
 * "scroll past the table to find the run button" pattern: the operator gets a clean page focused
 * on the run's scope.
 *
 * The left rail holds per-outcome toggles (`Skip new`, `Skip updates`, `Skip warning rows`,
 * `Update existing`). Flipping any control auto-recomputes the effective counters on the right
 * (locally — the server-side preview only needs to re-run when `updateExisting` changes, because
 * that branch decides create-vs-update on the server). The right side is the existing preview
 * pane with tabs for create / update / skip / failed / warnings.
 */
export function StepReview({ state, onChange, onBackToMapping, onStart }: StepReviewProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.review");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [previewLoading, setPreviewLoading] = useState(false);
    const [startLoading, setStartLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Effective counters after applying the operator's local-side filters. `Skip new` zeros the
     * `create` bucket and folds it into `skip`; `Skip updates` zeros `update`; `Skip warning rows`
     * folds every row that has at least one warning into `skip`. We can compute this client-side
     * because the preview already enumerates affected row numbers per warning.
     */
    const effective = applyControls(state.preview, state.controls);

    const handleControlChange = useCallback(
        (next: Partial<ReviewControls>) => {
            onChange({ controls: { ...state.controls, ...next } });
        },
        [onChange, state.controls],
    );

    const refreshPreview = useCallback(async () => {
        setError(null);
        setPreviewLoading(true);
        try {
            const response = await previewImport(
                {
                    import_id: state.importRow.id,
                    mapping: state.mapping,
                    update_existing: state.controls.updateExisting,
                },
                locale,
            );
            onChange({ preview: response.data });
        } catch (err) {
            setError(err instanceof Error ? err.message : t("previewFailed"));
        } finally {
            setPreviewLoading(false);
        }
    }, [locale, onChange, state.controls.updateExisting, state.importRow.id, state.mapping, t]);

    const handleStart = useCallback(async () => {
        setError(null);
        setStartLoading(true);
        try {
            const response = await startImport(
                {
                    import_id: state.importRow.id,
                    mapping: state.mapping,
                    update_existing: state.controls.updateExisting,
                    skip_new: state.controls.skipNew,
                    skip_updates: state.controls.skipUpdates,
                    skip_warning_rows: state.controls.skipWarningRows,
                },
                locale,
            );
            onStart(response.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : t("startFailed"));
        } finally {
            setStartLoading(false);
        }
    }, [locale, onStart, state.controls, state.importRow.id, state.mapping, t]);

    return (
        <article className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-5 text-card-foreground shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-xl tracking-tight">{t("title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" onClick={onBackToMapping}>
                        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                        {t("backToMapping")}
                    </Button>
                    <Button variant="outline" onClick={refreshPreview} disabled={previewLoading}>
                        {previewLoading ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
                        {t("rePreview")}
                    </Button>
                    <Button onClick={handleStart} disabled={startLoading} size="lg">
                        {startLoading ? <Spinner /> : <Play className="size-4" aria-hidden />}
                        {t("start")}
                    </Button>
                </div>
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
                            <h3 className="font-semibold text-base">{t("controlsTitle")}</h3>
                        </header>
                        <p className="mt-1 text-muted-foreground text-xs">{t("controlsHelp")}</p>

                        <div className="mt-4 flex flex-col gap-4">
                            <ControlRow
                                id="rc-update-existing"
                                checked={state.controls.updateExisting}
                                onCheckedChange={(value) => handleControlChange({ updateExisting: value })}
                                label={t("controls.updateExisting.label")}
                                help={t("controls.updateExisting.help")}
                                tone="primary"
                            />
                            <ControlRow
                                id="rc-skip-new"
                                checked={state.controls.skipNew}
                                onCheckedChange={(value) => handleControlChange({ skipNew: value })}
                                label={t("controls.skipNew.label")}
                                help={t("controls.skipNew.help")}
                                disabled={state.preview.totals.create === 0}
                                tone="success"
                            />
                            <ControlRow
                                id="rc-skip-updates"
                                checked={state.controls.skipUpdates}
                                onCheckedChange={(value) => handleControlChange({ skipUpdates: value })}
                                label={t("controls.skipUpdates.label")}
                                help={t("controls.skipUpdates.help")}
                                disabled={state.preview.totals.update === 0}
                                tone="info"
                            />
                            <ControlRow
                                id="rc-skip-warning"
                                checked={state.controls.skipWarningRows}
                                onCheckedChange={(value) => handleControlChange({ skipWarningRows: value })}
                                label={t("controls.skipWarningRows.label")}
                                help={t("controls.skipWarningRows.help")}
                                disabled={state.preview.totals.warnings === 0}
                                tone="warning"
                            />
                        </div>
                    </section>

                    <section className="rounded-lg border bg-muted/30 p-5 text-sm">
                        <h3 className="font-semibold">{t("effectiveTitle")}</h3>
                        <dl className="mt-3 space-y-2">
                            <EffectiveRow label={t("counters.willCreate")} value={fmt(effective.willCreate)} tone="success" />
                            <EffectiveRow label={t("counters.willUpdate")} value={fmt(effective.willUpdate)} tone="info" />
                            <EffectiveRow label={t("counters.willSkip")} value={fmt(effective.willSkip)} tone="muted" />
                            <EffectiveRow label={t("counters.willFail")} value={fmt(effective.willFail)} tone="danger" />
                        </dl>
                    </section>
                </aside>

                <PreviewPane preview={state.preview} />
            </div>

            <StickyActionBar open className="gap-3 px-4 py-2">
                <div className="flex items-center gap-3 text-xs">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {fmt(effective.willCreate)} <span className="text-muted-foreground">{t("counters.willCreate")}</span>
                    </span>
                    <span className="text-border" aria-hidden>
                        ·
                    </span>
                    <span className="font-medium text-sky-600 dark:text-sky-400">
                        {fmt(effective.willUpdate)} <span className="text-muted-foreground">{t("counters.willUpdate")}</span>
                    </span>
                    <span className="text-border" aria-hidden>
                        ·
                    </span>
                    <span className="font-medium text-muted-foreground">
                        {fmt(effective.willSkip)} {t("counters.willSkip")}
                    </span>
                    {effective.willFail > 0 ? (
                        <>
                            <span className="text-border" aria-hidden>
                                ·
                            </span>
                            <span className="font-medium text-destructive">
                                {fmt(effective.willFail)} {t("counters.willFail")}
                            </span>
                        </>
                    ) : null}
                </div>
                <Button size="sm" variant="ghost" onClick={refreshPreview} disabled={previewLoading}>
                    {previewLoading ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
                    {t("rePreview")}
                </Button>
                <Button size="sm" onClick={handleStart} disabled={startLoading}>
                    {startLoading ? <Spinner /> : <Play className="size-4" aria-hidden />}
                    {t("start")}
                </Button>
            </StickyActionBar>
        </article>
    );
}

interface ControlRowProps {
    id: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
    label: string;
    help: string;
    disabled?: boolean;
    tone: "primary" | "success" | "info" | "warning";
}

function ControlRow({ id, checked, onCheckedChange, label, help, disabled, tone }: ControlRowProps): React.JSX.Element {
    return (
        <div
            className={cn(
                "flex items-start gap-3 rounded-md border p-3 transition-colors",
                checked && tone === "primary" && "border-primary/40 bg-primary/5",
                checked && tone === "success" && "border-emerald-500/40 bg-emerald-500/5",
                checked && tone === "info" && "border-sky-500/40 bg-sky-500/5",
                checked && tone === "warning" && "border-amber-500/40 bg-amber-500/5",
                disabled && "opacity-50",
            )}
        >
            <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(value) => onCheckedChange(value === true)}
                disabled={disabled}
            />
            <div className="flex flex-col gap-1">
                <Label htmlFor={id} className={cn("cursor-pointer font-medium text-sm", disabled && "cursor-not-allowed")}>
                    {label}
                </Label>
                <p className="text-muted-foreground text-xs">{help}</p>
            </div>
        </div>
    );
}

interface EffectiveRowProps {
    label: string;
    value: string;
    tone: "success" | "info" | "muted" | "danger";
}

function EffectiveRow({ label, value, tone }: EffectiveRowProps): React.JSX.Element {
    return (
        <div className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    "font-semibold",
                    tone === "success" && "text-emerald-600 dark:text-emerald-400",
                    tone === "info" && "text-sky-600 dark:text-sky-400",
                    tone === "danger" && "text-destructive",
                )}
            >
                {value}
            </dd>
        </div>
    );
}

interface EffectiveCounters {
    willCreate: number;
    willUpdate: number;
    willSkip: number;
    willFail: number;
}

/**
 * Compute the "what will actually happen" counters from the raw preview + control toggles.
 * Mirrors the runner's logic so the operator sees the same numbers the server will commit.
 */
function applyControls(preview: ReviewState["preview"], controls: ReviewControls): EffectiveCounters {
    const warningRowSet = new Set<number>();
    for (const w of preview.warnings) {
        for (const r of w.rowNumbers) warningRowSet.add(r);
    }

    let willCreate = preview.totals.create;
    let willUpdate = preview.totals.update;
    let willSkip = preview.totals.skip;

    if (controls.skipNew) {
        willSkip += willCreate;
        willCreate = 0;
    }
    if (controls.skipUpdates) {
        willSkip += willUpdate;
        willUpdate = 0;
    }
    if (controls.skipWarningRows) {
        const warningCount = warningRowSet.size;
        const fromCreate = Math.min(willCreate, warningCount);
        willCreate -= fromCreate;
        const remaining = warningCount - fromCreate;
        const fromUpdate = Math.min(willUpdate, remaining);
        willUpdate -= fromUpdate;
        willSkip += warningCount;
    }

    return {
        willCreate,
        willUpdate,
        willSkip,
        willFail: preview.totals.fail,
    };
}
