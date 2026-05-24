"use client";

import { toPersianDigits } from "@calibra/shared/digits";
import { matchHeader } from "@calibra/shared/import-fields";
import { AlertTriangle, Eraser, Eye, Filter, MinusCircle, Play, Plus, RefreshCw, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { Spinner } from "#/components/ui/spinner";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { previewImport, startImport } from "#/lib/imports/api";
import type { PreviewResult, ProductImportRow } from "#/lib/imports/types";

import { DestinationPicker } from "./destination-picker";
import { PreviewPane } from "./preview-pane";
import type { MappingState } from "./wizard-state";

export interface StepMappingProps {
    state: MappingState;
    onChange: (next: Partial<MappingState>) => void;
    onStart: (importRow: ProductImportRow) => void;
}

/**
 * Step 2 — column mapping table, toolbar bulk actions, preset banner, and the inline preview
 * pane. Owns the mapping mutation that drives both preview + start endpoints.
 *
 * Toolbar bulk actions land:
 * - **Auto-map** runs `matchHeader` over every header and overwrites the mapping with the result.
 * - **Clear all** sets every header to `null`.
 * - **Drop unrelated** sets every header that didn't auto-match to `null`.
 * - **Save preset** flips the `savePreset` flag; the operator types a name and the start
 *   endpoint persists the mapping keyed by header-hash for future uploads.
 */
export function StepMapping({ state, onChange, onStart }: StepMappingProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.mapping");
    const tPreview = useTranslations("ProductsImport.preview");
    const locale = useLocale();
    const fmt = useCallback((n: number) => (locale === "fa" ? toPersianDigits(n) : String(n)), [locale]);

    const [previewLoading, setPreviewLoading] = useState(false);
    const [startLoading, setStartLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savePreset, setSavePreset] = useState(false);
    const [presetName, setPresetName] = useState("");

    const inlineWarnings = useMemo(() => deriveInlineWarnings(state), [state]);

    /**
     * Auto-scroll the preview pane into view when it first lands — without this the operator has
     * to scroll past the mapping table to discover that anything happened, which buries the most
     * important feedback in the wizard. We only scroll on the `null → non-null` transition so
     * subsequent re-previews don't yank the page when the operator is already reading results.
     */
    const previewRef = useRef<HTMLDivElement>(null);
    const previouslyHadPreview = useRef(state.preview !== null);
    useEffect(() => {
        const hadBefore = previouslyHadPreview.current;
        previouslyHadPreview.current = state.preview !== null;
        if (!hadBefore && state.preview !== null && previewRef.current !== null) {
            previewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [state.preview]);

    const updateMapping = useCallback(
        (header: string, value: string | null) => {
            onChange({ mapping: { ...state.mapping, [header]: value }, preview: null });
        },
        [onChange, state.mapping],
    );

    const handleAutoMap = useCallback(() => {
        const next: Record<string, string | null> = {};
        for (const header of state.headers) {
            const matched = matchHeader(header);
            next[header] = matched?.key ?? null;
        }
        onChange({ mapping: next, preview: null });
    }, [onChange, state.headers]);

    const handleClearAll = useCallback(() => {
        const next: Record<string, string | null> = {};
        for (const header of state.headers) next[header] = null;
        onChange({ mapping: next, preview: null });
    }, [onChange, state.headers]);

    const handleDropUnrelated = useCallback(() => {
        const next: Record<string, string | null> = { ...state.mapping };
        for (const header of state.headers) {
            if (matchHeader(header) === null) next[header] = null;
        }
        onChange({ mapping: next, preview: null });
    }, [onChange, state.headers, state.mapping]);

    const runPreview = useCallback(async (): Promise<PreviewResult | null> => {
        setError(null);
        setPreviewLoading(true);
        try {
            const response = await previewImport(
                { import_id: state.importRow.id, mapping: state.mapping, update_existing: state.updateExisting },
                locale,
            );
            onChange({ preview: response.data });
            return response.data;
        } catch (err) {
            setError(err instanceof Error ? err.message : t("previewFailed"));
            return null;
        } finally {
            setPreviewLoading(false);
        }
    }, [locale, onChange, state.importRow.id, state.mapping, state.updateExisting, t]);

    const handleStart = useCallback(async () => {
        setError(null);
        setStartLoading(true);
        try {
            const response = await startImport(
                {
                    import_id: state.importRow.id,
                    mapping: state.mapping,
                    update_existing: state.updateExisting,
                    save_preset: savePreset,
                    preset_name: savePreset ? (presetName.trim() === "" ? undefined : presetName.trim()) : undefined,
                },
                locale,
            );
            onStart(response.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : t("startFailed"));
        } finally {
            setStartLoading(false);
        }
    }, [locale, onStart, presetName, savePreset, state.importRow.id, state.mapping, state.updateExisting, t]);

    return (
        <article className="flex flex-col gap-4">
            <section className="rounded-lg border bg-card p-6 text-card-foreground shadow-xs">
                <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold text-xl">{t("title")}</h2>
                        <p className="mt-1 text-muted-foreground text-sm">{t("subtitle")}</p>
                    </div>
                </header>

                {state.presetMatch !== null ? (
                    <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                        <Wand2 className="size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
                        <p className="text-amber-900 dark:text-amber-100">
                            {t("presetApplied", { name: state.presetMatch.name })}
                        </p>
                    </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleAutoMap}>
                        <Wand2 className="size-4" aria-hidden />
                        {t("toolbar.autoMap")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleClearAll}>
                        <Eraser className="size-4" aria-hidden />
                        {t("toolbar.clearAll")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDropUnrelated}>
                        <Filter className="size-4" aria-hidden />
                        {t("toolbar.dropUnrelated")}
                    </Button>
                </div>

                {inlineWarnings.length > 0 ? (
                    <ul className="mt-4 space-y-2 text-sm">
                        {inlineWarnings.map((warning) => (
                            <li
                                key={warning}
                                className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-100"
                            >
                                {warning}
                            </li>
                        ))}
                    </ul>
                ) : null}

                <div className="mt-6 overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("columnHeader")}
                                </th>
                                <th scope="col" className="px-3 py-2 text-start font-medium">
                                    {t("destinationHeader")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.headers.map((header) => (
                                <tr key={header} className="border-t md:table-row">
                                    <td className="px-3 py-3 align-top">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-medium">{header}</span>
                                            <SamplesLine values={state.samples[header] ?? []} />
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 align-top">
                                        <DestinationPicker
                                            value={state.mapping[header] ?? null}
                                            onChange={(next) => updateMapping(header, next)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                    <Checkbox id="save-preset" checked={savePreset} onCheckedChange={(value) => setSavePreset(value === true)} />
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="save-preset" className="cursor-pointer font-medium text-sm">
                            {t("savePreset.label")}
                        </Label>
                        {savePreset ? (
                            <input
                                type="text"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                placeholder={t("savePreset.placeholder")}
                                className="h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm"
                            />
                        ) : null}
                    </div>
                </div>

                {error !== null ? (
                    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                        {error}
                    </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                    {state.preview === null ? (
                        <p className="me-auto text-muted-foreground text-xs">{t("previewFirstHint")}</p>
                    ) : null}
                    <Button variant="outline" onClick={() => runPreview()} disabled={previewLoading}>
                        {previewLoading ? <Spinner /> : <Eye className="size-4" aria-hidden />}
                        {t("preview")}
                    </Button>
                    <Button
                        onClick={handleStart}
                        disabled={startLoading || state.preview === null}
                        title={state.preview === null ? t("previewFirstHint") : undefined}
                    >
                        {startLoading ? <Spinner /> : <Play className="size-4" aria-hidden />}
                        {t("start")}
                    </Button>
                </div>
            </section>

            {state.preview !== null ? (
                <div ref={previewRef} className="scroll-mt-6">
                    <PreviewPane preview={state.preview} />
                </div>
            ) : null}

            {state.preview !== null && state.preview.failures.length > 0 ? (
                <div className="flex items-center justify-end">
                    <Button variant="outline" size="sm" onClick={() => runPreview()}>
                        <RefreshCw className="size-4" aria-hidden />
                        {t("rePreview")}
                    </Button>
                </div>
            ) : null}

            <StickyActionBar open={state.preview !== null} ariaLabel={t("stickyBarAria")} className="gap-4 px-4 py-2">
                {state.preview !== null ? (
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <Plus className="size-3.5" aria-hidden />
                            <span>{fmt(state.preview.totals.create)}</span>
                            <span className="text-muted-foreground">{tPreview("create")}</span>
                        </span>
                        <span className="text-border" aria-hidden>
                            ·
                        </span>
                        <span className="flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                            <RefreshCw className="size-3.5" aria-hidden />
                            <span>{fmt(state.preview.totals.update)}</span>
                            <span className="text-muted-foreground">{tPreview("update")}</span>
                        </span>
                        <span className="text-border" aria-hidden>
                            ·
                        </span>
                        <span className="flex items-center gap-1 font-medium text-muted-foreground">
                            <MinusCircle className="size-3.5" aria-hidden />
                            <span>{fmt(state.preview.totals.skip)}</span>
                            <span>{tPreview("skip")}</span>
                        </span>
                        {state.preview.totals.fail > 0 ? (
                            <>
                                <span className="text-border" aria-hidden>
                                    ·
                                </span>
                                <span className="flex items-center gap-1 font-medium text-destructive">
                                    <AlertTriangle className="size-3.5" aria-hidden />
                                    <span>{fmt(state.preview.totals.fail)}</span>
                                    <span>{tPreview("fail")}</span>
                                </span>
                            </>
                        ) : null}
                        {state.preview.totals.warnings > 0 ? (
                            <>
                                <span className="text-border" aria-hidden>
                                    ·
                                </span>
                                <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="size-3.5" aria-hidden />
                                    <span>{fmt(state.preview.totals.warnings)}</span>
                                    <span>{tPreview("warnings")}</span>
                                </span>
                            </>
                        ) : null}
                    </div>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => runPreview()} disabled={previewLoading}>
                    {previewLoading ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
                    {t("rePreview")}
                </Button>
                <Button size="sm" onClick={handleStart} disabled={startLoading || state.preview === null}>
                    {startLoading ? <Spinner /> : <Play className="size-4" aria-hidden />}
                    {t("start")}
                </Button>
            </StickyActionBar>
        </article>
    );
}

function SamplesLine({ values }: { values: string[] }): React.JSX.Element {
    const t = useTranslations("ProductsImport.mapping");
    if (values.length === 0) {
        return <span className="text-muted-foreground text-xs">{t("samplesEmpty")}</span>;
    }
    return (
        <span className="text-muted-foreground text-xs">
            {t("samplesLabel")}: {values.join("، ")}
        </span>
    );
}

function deriveInlineWarnings(state: MappingState): string[] {
    const warnings: string[] = [];
    const skuMapped = Object.values(state.mapping).some((v) => v === "sku");
    const nameMapped = Object.values(state.mapping).some((v) => v === "name");
    const priceMapped = Object.values(state.mapping).some((v) => v === "regular_price");
    if (!skuMapped) warnings.push("هیچ ستونی به SKU تطبیق داده نشده — فقط محصول جدید ساخته می‌شود");
    if (!nameMapped) warnings.push("نام محصول تطبیق داده نشده — مطمئنید؟");
    if (!priceMapped) warnings.push("قیمت اصلی تطبیق داده نشده — مطمئنید؟");

    const counts = new Map<string, number>();
    for (const value of Object.values(state.mapping)) {
        if (value === null) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const [field, count] of counts) {
        if (count > 1) warnings.push(`فیلد «${field}» با ${count} ستون تطبیق داده شده — مقدار دومی جایگزین می‌شود`);
    }
    return warnings;
}
