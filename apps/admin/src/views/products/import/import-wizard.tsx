"use client";

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { useRouter } from "#/lib/i18n/navigation";
import { getImport, uploadImportFile } from "#/lib/imports/api";
import type { ProductImportRow } from "#/lib/imports/types";

import { StepDone } from "./step-done";
import { StepImporting } from "./step-importing";
import { StepMapping } from "./step-mapping";
import { StepUpload } from "./step-upload";
import { Stepper } from "./stepper";
import { INITIAL_STATE, type MappingState, stepFromStatus, type WizardState } from "./wizard-state";

/**
 * Top-level wizard. Owns the state machine; transitions between steps; threads i18n + locale.
 *
 * Deep-link resume: when the URL has `?id=<importId>` (set by the persistent background-mode
 * header badge or by visiting the page from the history list), we hydrate the row from the
 * server and jump to the step that matches its current status. The `?id` param is also pushed by
 * the wizard itself once an import row exists, so a refresh keeps the operator in place.
 */
export function ImportWizard(): React.JSX.Element {
    const t = useTranslations("ProductsImport");
    const locale = useLocale();
    const router = useRouter();

    const [state, setState] = useState<WizardState>(INITIAL_STATE);
    const [farthest, setFarthest] = useState<WizardState["step"]>("upload");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadPercent, setUploadPercent] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const jumpToStatusStep = useCallback((row: ProductImportRow) => {
        const next = stepFromStatus(row);
        if (next === "mapping") {
            setState({
                step: "mapping",
                importRow: row,
                headers: Object.keys(row.mapping ?? {}),
                samples: {},
                presetMatch: null,
                mapping: row.mapping,
                updateExisting: row.update_existing,
                preview: null,
            });
        } else if (next === "importing") {
            setState({ step: "importing", importRow: row });
        } else if (next === "done") {
            setState({ step: "done", importRow: row });
        } else {
            setState(INITIAL_STATE);
        }
    }, []);

    /**
     * Hydrate the URL `?id=` param on mount. Skips hydration when an in-memory state already has
     * a higher step than "upload" (e.g. operator navigated through a soft transition).
     */
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (state.step !== "upload") return;
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        if (id === null || Number.isNaN(Number(id))) return;
        let cancelled = false;
        (async () => {
            try {
                const { data: row } = await getImport(Number(id), locale);
                if (cancelled) return;
                jumpToStatusStep(row);
            } catch {
                /** Soft fail: stale id, just stay on Step 1. */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [locale, state.step, jumpToStatusStep]);

    /** Track the farthest step the user has reached so they can re-enter mapping after preview. */
    useEffect(() => {
        const order: WizardState["step"][] = ["upload", "mapping", "importing", "done"];
        if (order.indexOf(state.step) > order.indexOf(farthest)) {
            setFarthest(state.step);
        }
    }, [farthest, state.step]);

    const writeQueryId = useCallback((id: number | null) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        if (id === null) {
            url.searchParams.delete("id");
        } else {
            url.searchParams.set("id", String(id));
        }
        window.history.replaceState({}, "", url.toString());
    }, []);

    const handleUpload = useCallback(
        async (file: File, options: { delimiter: string; encoding: string; updateExisting: boolean }) => {
            setUploadError(null);
            setIsUploading(true);
            setUploadPercent(0);
            try {
                const response = await uploadImportFile({
                    file,
                    locale,
                    delimiter: options.delimiter as never,
                    encoding: options.encoding as never,
                    onProgress: setUploadPercent,
                });
                setIsUploading(false);
                writeQueryId(response.data.id);
                setState({
                    step: "mapping",
                    importRow: { ...response.data, update_existing: options.updateExisting },
                    headers: response.headers,
                    samples: response.samples,
                    presetMatch: response.preset_match,
                    mapping: response.data.mapping,
                    updateExisting: options.updateExisting,
                    preview: null,
                });
            } catch (err) {
                setIsUploading(false);
                setUploadError(err instanceof Error ? err.message : t("step1.uploadFailed"));
            }
        },
        [locale, t, writeQueryId],
    );

    const handleBackToList = useCallback(() => {
        router.push("/products" as never);
    }, [router]);

    const handleStepClick = useCallback(
        (target: WizardState["step"]) => {
            if (target === "upload" && state.step !== "upload") {
                setState(INITIAL_STATE);
                writeQueryId(null);
                return;
            }
            if (target === "mapping") {
                if (state.step === "importing" || state.step === "done") return;
                if (state.step === "mapping") return;
            }
        },
        [state, writeQueryId],
    );

    const mappingNode = useMemo(() => {
        if (state.step !== "mapping") return null;
        return (
            <StepMapping
                state={state}
                onChange={(next: Partial<MappingState>) => setState({ ...state, ...next })}
                onStart={(row) => {
                    writeQueryId(row.id);
                    setState({ step: "importing", importRow: row });
                }}
            />
        );
    }, [state, writeQueryId]);

    const importingNode = useMemo(() => {
        if (state.step !== "importing") return null;
        return (
            <StepImporting
                importRow={state.importRow}
                onFinished={(row) => setState({ step: "done", importRow: row })}
                onBackToList={handleBackToList}
            />
        );
    }, [handleBackToList, state]);

    const doneNode = useMemo(() => {
        if (state.step !== "done") return null;
        return (
            <StepDone
                importRow={state.importRow}
                onAnother={() => {
                    setState(INITIAL_STATE);
                    setFarthest("upload");
                    writeQueryId(null);
                }}
                onBackToList={handleBackToList}
            />
        );
    }, [handleBackToList, state, writeQueryId]);

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

            {state.step === "upload" ? (
                <StepUpload
                    onFileSelected={handleUpload}
                    isUploading={isUploading}
                    uploadPercent={uploadPercent}
                    error={uploadError}
                />
            ) : null}
            {mappingNode}
            {importingNode}
            {doneNode}
        </section>
    );
}
