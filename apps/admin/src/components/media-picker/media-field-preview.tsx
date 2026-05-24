"use client";

import { ImagePlus, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { MediaPicker } from "./media-picker";

/** The minimal media reference an inspector needs to render and round-trip a single image field. */
export interface MediaFieldValue {
    id: number;
    url: string;
}

interface MediaFieldPreviewProps {
    label: string;
    value: MediaFieldValue | null;
    onChange: (next: MediaFieldValue | null) => void;
    className?: string;
    /** Optional aspect override — defaults to a logo-friendly 32-tall rect. */
    aspectClassName?: string;
}

/**
 * Inspector-side image field: a thumbnail + "Change" / "Remove" cluster. Tapping the empty state
 * (or "Change") opens a single-mode {@link MediaPicker} preloaded with the current value. The
 * picker emits an {@link AdminMedia}; we narrow it to `{ id, url }` so the inspector form stays
 * minimal — full media metadata lives in `/media`, not in every form draft.
 */
export function MediaFieldPreview({ label, value, onChange, className, aspectClassName }: MediaFieldPreviewProps) {
    const t = useTranslations("MediaPicker.field");
    const [pickerOpen, setPickerOpen] = useState(false);

    const handleSelect = (selection: AdminMedia | AdminMedia[]) => {
        if (Array.isArray(selection)) {
            const first = selection[0];
            if (first !== undefined) onChange({ id: first.id, url: first.url });
            return;
        }
        onChange({ id: selection.id, url: selection.url });
    };

    const handleRemove = () => onChange(null);

    return (
        <div className={cn("grid gap-2", className)}>
            <Label>{label}</Label>
            <div
                className={cn(
                    "relative flex items-center justify-center overflow-hidden rounded-xl border border-border/60 border-dashed bg-muted/30 transition-colors hover:border-primary/40 hover:bg-muted/50",
                    aspectClassName ?? "h-32",
                )}
            >
                {value === null ? (
                    <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ImagePlus className="size-5" aria-hidden="true" />
                        <span className="text-xs">{t("choose")}</span>
                    </button>
                ) : (
                    <>
                        {/* biome-ignore lint/performance/noImgElement: media preview, no Next/Image loader configured */}
                        <img src={value.url} alt={t("previewAlt")} className="h-full w-full object-contain p-2" />
                        <div className="absolute end-2 top-2 flex items-center gap-1">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setPickerOpen(true)}
                                className="h-7 gap-1 bg-background/80 px-2 text-xs backdrop-blur"
                            >
                                <Pencil className="size-3" aria-hidden="true" />
                                {t("change")}
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={handleRemove}
                                className="h-7 gap-1 bg-background/80 px-2 text-xs backdrop-blur"
                            >
                                <X className="size-3" aria-hidden="true" />
                                {t("remove")}
                            </Button>
                        </div>
                    </>
                )}
            </div>

            <MediaPicker
                open={pickerOpen}
                mode="single"
                value={value?.id ?? null}
                onOpenChange={setPickerOpen}
                onSelect={handleSelect}
            />
        </div>
    );
}
