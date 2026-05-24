"use client";

import { Check, FileIcon, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Progress } from "#/components/ui/progress";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { useUploadMedia } from "./queries";

interface UploadDropzoneProps {
    open: boolean;
    onClose: () => void;
    onUploaded: (row: AdminMedia) => void;
}

interface QueueEntry {
    id: string;
    file: File;
    status: "queued" | "uploading" | "uploaded" | "failed";
    percent: number;
    /**
     * Object URL for image files, used as a client-side thumbnail before the server URL is known.
     * `null` for non-images. Always revoked on entry removal / dialog close to avoid leaking.
     */
    previewUrl: string | null;
}

/**
 * Dialog-housed dropzone that accepts drag-and-drop OR click-to-pick. Each file gets its own
 * row with a progress bar; queued files start uploading immediately (one at a time, to keep
 * the server's per-request accounting honest). When all uploads finish, the operator can close
 * the dialog with the "Done" button — the parent receives an {@link AdminMedia} callback for
 * each successful upload so the grid stays in sync.
 */
export function UploadDropzone({ open, onClose, onUploaded }: UploadDropzoneProps) {
    const t = useTranslations("Media.upload");
    const upload = useUploadMedia();
    const [queue, setQueue] = useState<QueueEntry[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const counter = useRef(0);

    const addFiles = useCallback((files: FileList | File[]) => {
        const fresh: QueueEntry[] = [];
        for (const file of Array.from(files)) {
            counter.current += 1;
            const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
            fresh.push({
                id: `${Date.now()}-${counter.current}`,
                file,
                status: "queued",
                percent: 0,
                previewUrl,
            });
        }
        if (fresh.length > 0) setQueue((current) => [...current, ...fresh]);
    }, []);

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
            if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
        },
        [addFiles],
    );

    const removeEntry = useCallback((id: string) => {
        setQueue((current) => {
            const next: QueueEntry[] = [];
            for (const entry of current) {
                const drop = entry.id === id && entry.status !== "uploading";
                if (drop && entry.previewUrl !== null) URL.revokeObjectURL(entry.previewUrl);
                if (!drop) next.push(entry);
            }
            return next;
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const nextQueued = queue.find((entry) => entry.status === "queued");
        const hasInFlight = queue.some((entry) => entry.status === "uploading");
        if (nextQueued === undefined || hasInFlight) return;

        setQueue((current) =>
            current.map((entry) => (entry.id === nextQueued.id ? { ...entry, status: "uploading", percent: 0 } : entry)),
        );

        upload.mutate(
            {
                file: nextQueued.file,
                onProgress: (percent) =>
                    setQueue((current) => current.map((entry) => (entry.id === nextQueued.id ? { ...entry, percent } : entry))),
            },
            {
                onSuccess: (row) => {
                    setQueue((current) =>
                        current.map((entry) =>
                            entry.id === nextQueued.id ? { ...entry, status: "uploaded", percent: 100 } : entry,
                        ),
                    );
                    onUploaded(row);
                },
                onError: () => {
                    setQueue((current) =>
                        current.map((entry) => (entry.id === nextQueued.id ? { ...entry, status: "failed" } : entry)),
                    );
                },
            },
        );
    }, [open, queue, upload, onUploaded]);

    const total = queue.length;
    const done = queue.filter((entry) => entry.status === "uploaded" || entry.status === "failed").length;

    const handleClose = useCallback(() => {
        setQueue((current) => {
            for (const entry of current) {
                if (entry.previewUrl !== null) URL.revokeObjectURL(entry.previewUrl);
            }
            return [];
        });
        onClose();
    }, [onClose]);

    return (
        <Dialog open={open} onOpenChange={(next) => (next ? undefined : handleClose())}>
            <DialogContent className="max-w-xl">
                <DialogTitle className="text-base">{t("title")}</DialogTitle>
                <p className="text-muted-foreground text-sm">{t("subtitle")}</p>

                <section
                    aria-label={t("dropHint")}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                        "flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/30 px-4 py-8 text-center transition-colors",
                        dragOver ? "border-primary bg-primary/10" : "border-border/60",
                    )}
                >
                    <Upload className="size-7 text-muted-foreground" aria-hidden="true" />
                    <p className="text-muted-foreground text-sm">{t("dropHint")}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        {t("browse")}
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            if (event.target.files) addFiles(event.target.files);
                            event.target.value = "";
                        }}
                    />
                </section>

                {queue.length > 0 && (
                    <ul className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
                        {queue.map((entry) => (
                            <li
                                key={entry.id}
                                className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm"
                            >
                                <QueueThumbnail entry={entry} />
                                <span className="min-w-0 flex-1 truncate" dir="ltr">
                                    {entry.file.name}
                                </span>
                                <div className="w-24">
                                    <Progress value={entry.percent} />
                                </div>
                                {entry.status === "queued" && (
                                    <button
                                        type="button"
                                        onClick={() => removeEntry(entry.id)}
                                        aria-label={t("remove")}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="size-3.5" aria-hidden="true" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("filesCounter", { done, total })}</span>
                    <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                        {t("doneClose")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface QueueThumbnailProps {
    entry: QueueEntry;
}

/**
 * Leading cell of each queue row. Renders a tiny preview of the file the operator just dropped:
 *
 *   - Images get a thumbnail painted from the local blob URL — instant feedback, no waiting on
 *     the server to round-trip the upload.
 *   - Non-images fall back to a generic file icon on a muted square.
 *
 * Status (uploaded ✓ / failed ✕) shows as a corner badge so the row still communicates state at
 * a glance without the thumbnail itself changing. While uploading/queued, the thumbnail stays
 * clean — the progress bar to the right carries the activity signal.
 */
function QueueThumbnail({ entry }: QueueThumbnailProps) {
    const hasPreview = entry.previewUrl !== null;
    return (
        <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40">
            {hasPreview ? (
                /* biome-ignore lint/performance/noImgElement: local blob preview, no Next/Image loader configured */
                <img src={entry.previewUrl ?? ""} alt="" className="size-full object-cover" />
            ) : (
                <div className="flex size-full items-center justify-center">
                    <FileIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
            )}
            {entry.status === "uploaded" && (
                <span
                    aria-hidden="true"
                    className="absolute end-[-3px] top-[-3px] inline-flex size-4 items-center justify-center rounded-full border-2 border-card bg-emerald-500 text-white"
                >
                    <Check className="size-2.5" />
                </span>
            )}
            {entry.status === "failed" && (
                <span
                    aria-hidden="true"
                    className="absolute end-[-3px] top-[-3px] inline-flex size-4 items-center justify-center rounded-full border-2 border-card bg-destructive text-destructive-foreground"
                >
                    <X className="size-2.5" />
                </span>
            )}
        </div>
    );
}
