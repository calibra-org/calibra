"use client";

import { Check, File, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { classifyMediaType, type MediaCategory } from "./types";

interface MediaTileProps {
    row: AdminMedia;
    selected: boolean;
    isActive: boolean;
    bulkMode: boolean;
    onClick: () => void;
    onToggleSelect: () => void;
}

/**
 * One grid tile. The whole tile is a `<button>` so a single click anywhere selects (in bulk mode)
 * or opens the modal (in plain mode). The select affordance in the top-end corner is duplicated
 * for keyboard users via an explicit `<button>` overlay; in bulk mode it stays visible, in plain
 * mode it appears on hover/focus.
 */
export function MediaTile({ row, selected, isActive, bulkMode, onClick, onToggleSelect }: MediaTileProps) {
    const tTile = useTranslations("Media.tile");
    const display = row.title ?? row.filename;
    const category = classifyMediaType(row.mime);
    const ariaLabel = bulkMode ? tTile("selectAria", { name: display }) : tTile("openAria", { name: display });
    return (
        <div
            className={cn("group relative", selected && "rounded-lg ring-2 ring-primary/70 ring-offset-2 ring-offset-background")}
        >
            <button
                type="button"
                onClick={onClick}
                aria-label={ariaLabel}
                aria-pressed={bulkMode ? selected : undefined}
                className={cn(
                    "flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-card text-muted-foreground transition-colors",
                    isActive && !selected && "border-primary/40",
                    !isActive && !selected && "border-border/60 hover:border-border",
                )}
            >
                {category === "image" ? (
                    // biome-ignore lint/performance/noImgElement: external thumbnails, no Next/Image loader configured
                    <img src={row.url} alt={row.alt ?? display} loading="lazy" className="size-full object-cover" />
                ) : (
                    <FilePlaceholder category={category} filename={display} />
                )}
            </button>

            <button
                type="button"
                tabIndex={bulkMode ? 0 : -1}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleSelect();
                }}
                aria-label={tTile("selectAria", { name: display })}
                aria-pressed={selected}
                className={cn(
                    "absolute end-2 top-2 inline-flex size-7 items-center justify-center rounded-full border-2 transition-[colors,opacity]",
                    /**
                     * Visibility rule. Selected tiles always render the filled-primary badge so
                     * the operator can scan a grid and instantly see what's checked, even after
                     * they've moved the cursor away. Bulk mode keeps the empty affordance always
                     * visible so the operator knows the tile is clickable as a checkbox. Plain
                     * mode hides the empty affordance until the tile is hovered or focused.
                     */
                    selected
                        ? "border-primary bg-primary text-primary-foreground opacity-100"
                        : bulkMode
                          ? "border-white/80 bg-background/70 text-transparent opacity-100 hover:text-foreground"
                          : "border-white/80 bg-background/70 text-transparent opacity-0 hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100",
                )}
            >
                <Check className="size-4" aria-hidden="true" />
            </button>

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
