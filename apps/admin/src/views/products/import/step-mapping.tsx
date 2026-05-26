"use client";

import { matchHeader } from "@calibra/shared/import-fields";
import { ArrowRight, Eraser, Filter, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { previewImport } from "#/lib/imports/api";
import type { PreviewResult } from "#/lib/imports/types";

import { DestinationPicker } from "./destination-picker";
import type { MappingState, ReviewControls } from "./wizard-state";

export interface StepMappingProps {
    state: MappingState;
    onChange: (next: Partial<MappingState>) => void;
    /**
     * Hand-off to the dedicated review step. The wizard owner builds the `ReviewState` from
     * the supplied preview + initial controls (which seed `updateExisting` from the current
     * mapping state).
     */
    onReview: (args: { preview: PreviewResult; controls: ReviewControls }) => void;
}

/**
 * Step 2 — column mapping table + toolbar bulk actions + preset banner. Hands off to the
 * dedicated review step on"Continue to review"— preview now lives on its own page rather than
 * inline below the mapping table, so the operator has a clean workspace for the actual decision.
 */
export function StepMapping({ state, onChange, onReview }: StepMappingProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.mapping");
    const locale = useLocale();

    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const inlineWarnings = useMemo(() => deriveInlineWarnings(state), [state]);

    const updateMapping = useCallback(
        (header: string, value: string | null) => {
            onChange({ mapping: { ...state.mapping, [header]: value } });
        },
        [onChange, state.mapping],
    );

    const handleAutoMap = useCallback(() => {
        const next: Record<string, string | null> = {};
        for (const header of state.headers) {
            const matched = matchHeader(header);
            next[header] = matched?.key ?? null;
        }
        onChange({ mapping: next });
    }, [onChange, state.headers]);

    const handleClearAll = useCallback(() => {
        const next: Record<string, string | null> = {};
        for (const header of state.headers) next[header] = null;
        onChange({ mapping: next });
    }, [onChange, state.headers]);

    const handleDropUnrelated = useCallback(() => {
        const next: Record<string, string | null> = { ...state.mapping };
        for (const header of state.headers) {
            if (matchHeader(header) === null) next[header] = null;
        }
        onChange({ mapping: next });
    }, [onChange, state.headers, state.mapping]);

    const handleContinue = useCallback(async () => {
        setError(null);
        setPreviewLoading(true);
        try {
            const response = await previewImport(
                { import_id: state.importRow.id, mapping: state.mapping, update_existing: state.updateExisting },
                locale,
            );
            onReview({
                preview: response.data,
                controls: {
                    skipNew: false,
                    skipUpdates: false,
                    skipWarningRows: false,
                    updateExisting: state.updateExisting,
                },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : t("previewFailed"));
        } finally {
            setPreviewLoading(false);
        }
    }, [locale, onReview, state.importRow.id, state.mapping, state.updateExisting, t]);

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
                    <div className="mt-4 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                        <Wand2 className="size-4 shrink-0 text-warning" aria-hidden />
                        <p className="text-warning">{t("presetApplied", { name: state.presetMatch.name })}</p>
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
                            <li key={warning} className="rounded-md border border-warning/30 bg-warning/5 p-3 text-warning">
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

                {error !== null ? (
                    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                        {error}
                    </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                    <Button onClick={handleContinue} disabled={previewLoading} size="lg">
                        {previewLoading ? <Spinner /> : <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />}
                        {t("continueToReview")}
                    </Button>
                </div>
            </section>
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
            {t("samplesLabel")}: {values.join("،")}
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
