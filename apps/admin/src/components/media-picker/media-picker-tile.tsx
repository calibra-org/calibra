"use client";

import { Check, File, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo } from "lucide-react";
import { useTranslations } from "next-intl";

import { mediaVariantUrl } from "#/lib/media-variants";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";
import { classifyMediaType, type MediaCategory } from "#/views/media/types";

import type { MediaPickerMode } from "./types";

interface MediaPickerTileProps {
    row: AdminMedia;
    selected: boolean;
    mode: MediaPickerMode;
    selectionIndex: number | null;
    onToggle: () => void;
}

/**
 * Picker-flavoured tile. Visually mirrors the workbench tile (same thumbnail / placeholder), but
 * the entire tile is a click-to-select target — there is no "open modal" affordance because the
 * picker only ever does selection. In multi mode, a numbered badge in the top-end corner shows the
 * selection order so operators previewing a gallery know which image lands first.
 */
export function MediaPickerTile({ row, selected, mode, selectionIndex, onToggle }: MediaPickerTileProps) {
    const tTile = useTranslations("Media.tile");
    const display = row.title ?? row.filename;
    const category = classifyMediaType(row.mime);
    const ariaLabel = tTile("selectAria", { name: display });
    return (
        <div
            className={cn("group relative", selected && "rounded-lg ring-2 ring-primary/70 ring-offset-2 ring-offset-background")}
        >
            <button
                type="button"
                onClick={onToggle}
                aria-label={ariaLabel}
                aria-pressed={selected}
                className={cn(
                    "flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-card text-muted-foreground transition-colors",
                    selected ? "border-primary/60" : "border-border/60 hover:border-border",
                )}
            >
                {category === "image" ? (
                    /* biome-ignore lint/performance/noImgElement: external thumbnails, no Next/Image loader configured */
                    <img
                        src={mediaVariantUrl(row, "medium")}
                        alt={row.alt ?? display}
                        loading="lazy"
                        className="size-full object-cover"
                    />
                ) : (
                    <FilePlaceholder category={category} filename={display} />
                )}
            </button>

            <span
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute end-2 top-2 inline-flex size-7 items-center justify-center rounded-full border-2 font-semibold text-xs transition-colors",
                    selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/80 bg-background/70 text-transparent group-hover:text-foreground",
                )}
            >
                {mode === "multiple" && selectionIndex !== null ? selectionIndex + 1 : <Check className="size-4" />}
            </span>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-start text-white text-xs">
                {display}
            </div>
        </div>
    );
}

interface FilePlaceholderProps {
    category: MediaCategory;
    filename: string;
}

function FilePlaceholder({ category, filename }: FilePlaceholderProps) {
    const Icon = pickIcon(category);
    return (
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted/30 px-2 text-center">
            <Icon className="size-10 text-muted-foreground/70" aria-hidden="true" />
            <span dir="ltr" className="line-clamp-2 break-all font-mono text-[10px] text-muted-foreground/80">
                {filename}
            </span>
        </div>
    );
}

function pickIcon(category: MediaCategory) {
    if (category === "audio") return FileAudio;
    if (category === "video") return FileVideo;
    if (category === "spreadsheet") return FileSpreadsheet;
    if (category === "archive") return FileArchive;
    if (category === "document") return FileText;
    return File;
}
