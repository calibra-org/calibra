"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { getExport } from "#/lib/exports/api";
import type { ProductExportRow, ProductExportScope } from "#/lib/exports/types";
import { useRouter } from "#/lib/i18n/navigation";

import { StepDone } from "./step-done";
import { StepExporting } from "./step-exporting";
import { StepFilterAndColumns } from "./step-filter-and-columns";
import { StepReview } from "./step-review";
import { Stepper } from "./stepper";
import { type FilterState, initialFilterState, type ReviewState, stepFromStatus, type WizardState } from "./wizard-state";

const STEP_ORDER: WizardState["step"][] = ["filter", "review", "exporting", "done"];

export interface ExportWizardProps {
    /** Pre-applied scope (e.g. when entered from the bulk-action bar or filter chips). */
    initialScope?: ProductExportScope;
    /** Selected product ids — only honored when `initialScope === "selected"`. */
    initialSelectedIds?: number[];
}

/**
 * Top-level export wizard. Three steps with optional deep-link resume via `?id=<exportId>`.
 * Owns the state machine and threads the SSE handoff between step 2 and step 3.
 */
export function ExportWizard({ initialScope = "filter", initialSelectedIds = [] }: ExportWizardProps): React.JSX.Element {
    const t = useTranslations("ProductsExport");
    const locale = useLocale();
    const router = useRouter();

    const [state, setState] = useState<WizardState>(() => initialFilterState(initialScope, initialSelectedIds));
    const [farthest, setFarthest] = useState<WizardState["step"]>("filter");

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (state.step !== "filter") return;
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        if (id === null || Number.isNaN(Number(id))) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await getExport(Number(id), locale);
                if (cancelled) return;
                const next = stepFromStatus(data);
                if (next === "exporting") setState({ step: "exporting", exportRow: data });
                else if (next === "done") setState({ step: "done", exportRow: data, token: null });
            } catch {
                /** Stale id; remain on Step 1. */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [locale, state.step]);

    useEffect(() => {
        if (STEP_ORDER.indexOf(state.step) > STEP_ORDER.indexOf(farthest)) {
            setFarthest(state.step);
        }
    }, [farthest, state.step]);

    const writeQueryId = useCallback((id: number | null) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (id === null) url.searchParams.delete("id");
        else url.searchParams.set("id", String(id));
        window.history.replaceState({}, "", url.toString());
    }, []);

    const handleBackToList = useCallback(() => router.push("/products" as never), [router]);

    const handleStepClick = useCallback(
        (target: WizardState["step"]) => {
            if (target === state.step) return;
            if (target === "filter") {
                if (state.step === "review") {
                    setState({
                        step: "filter",
                        scope: state.scope,
                        filters: state.filters,
                        columns: state.columns,
                        format: state.format,
                        selectedIds: state.selectedIds,
                    });
                    setFarthest("filter");
                    writeQueryId(null);
                    return;
                }
                setState(initialFilterState(initialScope, initialSelectedIds));
                setFarthest("filter");
                writeQueryId(null);
            }
        },
        [initialScope, initialSelectedIds, state, writeQueryId],
    );

    const filterNode = useMemo(() => {
        if (state.step !== "filter") return null;
        return (
            <StepFilterAndColumns
                state={state}
                onChange={(next: Partial<FilterState>) => setState({ ...state, ...next })}
                onReview={({ preview, matchCount }) => {
                    setState({
                        step: "review",
                        scope: state.scope,
                        filters: state.filters,
                        columns: state.columns,
                        format: state.format,
                        selectedIds: state.selectedIds,
                        preview,
                        matchCount,
                    });
                }}
            />
        );
    }, [state]);

    const reviewNode = useMemo(() => {
        if (state.step !== "review") return null;
        return (
            <StepReview
                state={state}
                onChange={(next: Partial<ReviewState>) => setState({ ...state, ...next })}
                onBackToFilter={() => {
                    setState({
                        step: "filter",
                        scope: state.scope,
                        filters: state.filters,
                        columns: state.columns,
                        format: state.format,
                        selectedIds: state.selectedIds,
                    });
                }}
                onStart={(row: ProductExportRow) => {
                    writeQueryId(row.id);
                    setState({ step: "exporting", exportRow: row });
                }}
            />
        );
    }, [state, writeQueryId]);

    const exportingNode = useMemo(() => {
        if (state.step !== "exporting") return null;
        return (
            <StepExporting
                exportRow={state.exportRow}
                onFinished={(row, token) => setState({ step: "done", exportRow: row, token })}
                onBackToList={handleBackToList}
            />
        );
    }, [handleBackToList, state]);

    const doneNode = useMemo(() => {
        if (state.step !== "done") return null;
        return (
            <StepDone
                exportRow={state.exportRow}
                token={state.token}
                onAnother={() => {
                    setState(initialFilterState(initialScope, initialSelectedIds));
                    setFarthest("filter");
                    writeQueryId(null);
                }}
                onBackToList={handleBackToList}
            />
        );
    }, [handleBackToList, initialScope, initialSelectedIds, state, writeQueryId]);

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
                <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={handleBackToList}>
                    <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
                    {t("backToProducts")}
                </Button>
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <Stepper current={state.step} farthest={farthest} onStepClick={handleStepClick} />
            </header>

            {filterNode}
            {reviewNode}
            {exportingNode}
            {doneNode}
        </section>
    );
}
