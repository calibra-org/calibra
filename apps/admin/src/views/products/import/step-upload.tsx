"use client";

import { ChevronDown, Download, FileText, History, Upload as UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { Link } from "#/lib/i18n/navigation";
import { importTemplateUrl } from "#/lib/imports/api";
import { cn } from "#/lib/utils";

const ACCEPTED_MIME = {
    "text/csv": [".csv"],
    "text/plain": [".txt"],
    "application/vnd.ms-excel": [".xls"],
    "application/vnd.openxmlformats-officedetail.spreadsheetml.sheet": [".xlsx"],
};
const MAX_BYTES = 100 * 1024 * 1024;

export interface StepUploadProps {
    onFileSelected: (file: File, options: { delimiter: string; encoding: string; updateExisting: boolean }) => void;
    isUploading: boolean;
    uploadPercent: number;
    error: string | null;
}

/**
 * Step 1 — operator drops or pastes a CSV/XLSX file. The component owns the local-only state
 * (advanced options panel, drag-overlay) and shoots a single `onFileSelected` event upward when
 * a file is locked in. Parent owns the upload mutation + transition to Step 2.
 *
 * Honors UX mandate points 1–3: template download, large dropzone, clipboard paste, XLSX accept.
 * Point 14 (`Enter` to continue, `/` to focus search) is handled by the parent wizard since the
 * shortcuts are global to the wizard.
 */
export function StepUpload({ onFileSelected, isUploading, uploadPercent, error }: StepUploadProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.step1");
    const tCommon = useTranslations("ProductsImport.common");

    const [updateExisting, setUpdateExisting] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [delimiter, setDelimiter] = useState<"auto" | "," | ";" | "\t">("auto");
    const [encoding, setEncoding] = useState<"auto" | "utf-8" | "windows-1256">("auto");
    const [pickedName, setPickedName] = useState<string | null>(null);

    const handleFile = useCallback(
        (file: File) => {
            setPickedName(file.name);
            onFileSelected(file, { delimiter, encoding, updateExisting });
        },
        [delimiter, encoding, onFileSelected, updateExisting],
    );

    const onDrop = useCallback(
        (accepted: File[]) => {
            const file = accepted[0];
            if (file === undefined) return;
            handleFile(file);
        },
        [handleFile],
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: ACCEPTED_MIME,
        maxFiles: 1,
        maxSize: MAX_BYTES,
        multiple: false,
        onDrop,
    });

    const pasteRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = async (event: ClipboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
                return;
            }
            const files = event.clipboardData?.files;
            if (files !== undefined && files.length > 0) {
                event.preventDefault();
                handleFile(files[0]!);
                return;
            }
            const text = event.clipboardData?.getData("text/plain");
            if (typeof text === "string" && text.includes(",") && text.includes("\n")) {
                event.preventDefault();
                const blob = new Blob([text], { type: "text/csv" });
                const file = new File([blob], `pasted-${Date.now()}.csv`, { type: "text/csv" });
                handleFile(file);
            }
        };
        window.addEventListener("paste", handler);
        return () => window.removeEventListener("paste", handler);
    }, [handleFile]);

    return (
        <article className="rounded-lg border bg-card text-card-foreground shadow-xs" ref={pasteRef} tabIndex={-1}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b p-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-xl">{t("title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <a href={importTemplateUrl()} download>
                            <Download className="size-4" aria-hidden />
                            {t("downloadTemplate")}
                        </a>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href={"/products/import/history" as never}>
                            <History className="size-4" aria-hidden />
                            {t("history")}
                        </Link>
                    </Button>
                </div>
            </header>

            <div className="flex flex-col gap-6 p-6">
                <div
                    {...getRootProps({
                        className: cn(
                            "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-2 border-dashed p-8 text-center transition-colors",
                            isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60",
                            isUploading && "pointer-events-none opacity-70",
                        ),
                    })}
                >
                    <input {...getInputProps()} aria-label={t("dropzoneAria")} />
                    <UploadIcon className="size-10 text-muted-foreground" aria-hidden />
                    <p className="font-medium">{isDragActive ? t("dropHere") : t("dropOrClick")}</p>
                    <p className="text-muted-foreground text-sm">{t("pasteHint")}</p>
                    <p className="text-muted-foreground text-xs">{t("accepted", { mb: 100 })}</p>
                    {pickedName !== null ? (
                        <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
                            <FileText className="size-4 text-muted-foreground" aria-hidden />
                            <span className="font-medium">{pickedName}</span>
                        </div>
                    ) : null}
                    {isUploading ? (
                        <div className="mt-3 w-full max-w-md">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div className="h-full bg-primary transition-all" style={{ width: `${uploadPercent}%` }} />
                            </div>
                            <p className="mt-2 text-muted-foreground text-xs">{t("uploading", { percent: uploadPercent })}</p>
                        </div>
                    ) : null}
                </div>

                {error !== null ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
                        {error}
                    </div>
                ) : null}

                <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                    <Checkbox
                        id="update-existing"
                        checked={updateExisting}
                        onCheckedChange={(value) => setUpdateExisting(value === true)}
                    />
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="update-existing" className="cursor-pointer font-medium text-sm">
                            {t("updateExisting.label")}
                        </Label>
                        <p className="text-muted-foreground text-xs">{t("updateExisting.help")}</p>
                    </div>
                </div>

                <details
                    className="rounded-md border"
                    open={advancedOpen}
                    onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
                >
                    <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 font-medium text-sm">
                        <span>{t("advanced.title")}</span>
                        <ChevronDown className={cn("size-4 transition-transform", advancedOpen && "rotate-180")} aria-hidden />
                    </summary>
                    <div className="grid grid-cols-1 gap-4 border-t p-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                            <Label className="text-xs" htmlFor="delimiter">
                                {t("advanced.delimiter")}
                            </Label>
                            <div className="relative">
                                <select
                                    id="delimiter"
                                    value={delimiter}
                                    onChange={(e) => setDelimiter(e.target.value as never)}
                                    className={cn(
                                        "h-9 w-full appearance-none rounded-md border bg-background ps-3 pe-9 text-sm shadow-xs outline-none",
                                        "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                                    )}
                                >
                                    <option value="auto">{tCommon("auto")}</option>
                                    <option value=",">,</option>
                                    <option value=";">;</option>
                                    <option value="\t">{tCommon("tab")}</option>
                                </select>
                                <ChevronDown
                                    className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-xs" htmlFor="encoding">
                                {t("advanced.encoding")}
                            </Label>
                            <div className="relative">
                                <select
                                    id="encoding"
                                    value={encoding}
                                    onChange={(e) => setEncoding(e.target.value as never)}
                                    className={cn(
                                        "h-9 w-full appearance-none rounded-md border bg-background ps-3 pe-9 text-sm shadow-xs outline-none",
                                        "hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                                    )}
                                >
                                    <option value="auto">{tCommon("auto")}</option>
                                    <option value="utf-8">UTF-8</option>
                                    <option value="windows-1256">Windows-1256</option>
                                </select>
                                <ChevronDown
                                    className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden
                                />
                            </div>
                        </div>
                    </div>
                </details>
            </div>
        </article>
    );
}
