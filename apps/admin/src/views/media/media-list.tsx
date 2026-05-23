"use client";

import type { Locale } from "@calibra/shared/i18n";
import {
    Download,
    Eye,
    File,
    FileArchive,
    FileAudio,
    FileSpreadsheet,
    FileText,
    FileVideo,
    Link as LinkIcon,
    Pencil,
    Search,
    Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { formatDate } from "#/lib/format";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { classifyMediaType, type MediaCategory } from "./types";

interface MediaListProps {
    rows: readonly AdminMedia[];
    selectedIds: ReadonlySet<number>;
    activeId: number | null;
    bulkMode: boolean;
    locale: Locale;
    isLoading: boolean;
    isFiltering: boolean;
    canLoadMore: boolean;
    isLoadingMore: boolean;
    onRowOpen: (row: AdminMedia) => void;
    onRowToggle: (id: number) => void;
    onToggleAll: () => void;
    onEdit: (row: AdminMedia) => void;
    onDelete: (row: AdminMedia) => void;
    onView: (row: AdminMedia) => void;
    onCopyUrl: (row: AdminMedia) => void;
    onDownload: (row: AdminMedia) => void;
    onLoadMore: () => void;
}

/**
 * List view. Hand-rolled `<table>` mirroring the brands / tags list — leading checkbox column
 * when bulk mode is on, thumbnail + stacked title/filename in the "File" cell, and the
 * Edit / Delete / View / Copy URL / Download cluster on hover beneath the filename (matching
 * the WordPress arrangement instead of a trailing actions column).
 */
export function MediaList({
    rows,
    selectedIds,
    activeId,
    bulkMode,
    locale,
    isLoading,
    isFiltering,
    canLoadMore,
    isLoadingMore,
    onRowOpen,
    onRowToggle,
    onToggleAll,
    onEdit,
    onDelete,
    onView,
    onCopyUrl,
    onDownload,
    onLoadMore,
}: MediaListProps) {
    const t = useTranslations("Media");
    const tTable = useTranslations("Media.table");
    const tRow = useTranslations("Media.row");
    const tEmpty = useTranslations("Media.emptyList");

    if (rows.length === 0 && !isLoading) {
        const key = isFiltering ? "noResults" : "empty";
        return (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-12 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <Search className="size-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                    <h3 className="font-medium text-foreground">{tEmpty(`${key}.title` as Parameters<typeof tEmpty>[0])}</h3>
                    <p className="max-w-sm text-muted-foreground text-sm">
                        {tEmpty(`${key}.description` as Parameters<typeof tEmpty>[0])}
                    </p>
                </div>
            </div>
        );
    }

    const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
    const stopAndCall = (handler: (row: AdminMedia) => void, row: AdminMedia) => (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        handler(row);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-border/60 border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                            {bulkMode && (
                                <th className="w-10 px-3 py-2">
                                    <Checkbox
                                        aria-label={tTable("selectAll")}
                                        checked={allVisibleSelected}
                                        onCheckedChange={onToggleAll}
                                    />
                                </th>
                            )}
                            <th className="px-3 py-2 text-start font-medium">{tTable("file")}</th>
                            <th className="hidden px-3 py-2 text-start font-medium md:table-cell">{tTable("author")}</th>
                            <th className="hidden px-3 py-2 text-start font-medium lg:table-cell">{tTable("uploadedIn")}</th>
                            <th className="px-3 py-2 text-start font-medium">{tTable("date")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const isSelected = selectedIds.has(row.id);
                            const isActive = activeId === row.id;
                            const display = row.title ?? row.filename;
                            return (
                                <tr
                                    key={row.id}
                                    className={cn(
                                        "group border-border/40 border-b transition-colors last:border-b-0",
                                        isActive ? "bg-primary/5" : "hover:bg-muted/40",
                                        isSelected && "bg-primary/10",
                                    )}
                                >
                                    {bulkMode && (
                                        <td className="w-10 px-3 py-2 align-top">
                                            <Checkbox
                                                aria-label={tTable("selectRow", { name: display })}
                                                checked={isSelected}
                                                onCheckedChange={() => onRowToggle(row.id)}
                                            />
                                        </td>
                                    )}
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex items-start gap-3">
                                            <Thumbnail row={row} />
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => onRowOpen(row)}
                                                    className={cn(
                                                        "block max-w-full truncate text-start font-medium",
                                                        isActive ? "text-primary" : "text-foreground hover:text-primary",
                                                    )}
                                                >
                                                    {display}
                                                </button>
                                                <span className="block max-w-full truncate font-mono text-[11px] text-muted-foreground text-start">
                                                    {row.filename}
                                                </span>
                                                <div
                                                    className={cn(
                                                        "mt-0.5 inline-flex items-center gap-1 text-xs opacity-0 transition-opacity",
                                                        "group-focus-within:opacity-100 group-hover:opacity-100",
                                                        isActive && "opacity-100",
                                                    )}
                                                >
                                                    <HoverAction
                                                        icon={Pencil}
                                                        label={tRow("edit")}
                                                        onClick={stopAndCall(onEdit, row)}
                                                    />
                                                    <HoverAction
                                                        icon={Trash2}
                                                        label={tRow("delete")}
                                                        tone="danger"
                                                        onClick={stopAndCall(onDelete, row)}
                                                    />
                                                    <HoverAction
                                                        icon={Eye}
                                                        label={tRow("view")}
                                                        onClick={stopAndCall(onView, row)}
                                                    />
                                                    <HoverAction
                                                        icon={LinkIcon}
                                                        label={tRow("copyUrl")}
                                                        onClick={stopAndCall(onCopyUrl, row)}
                                                    />
                                                    <HoverAction
                                                        icon={Download}
                                                        label={tRow("download")}
                                                        onClick={stopAndCall(onDownload, row)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden px-3 py-2 align-top text-muted-foreground md:table-cell">
                                        {row.uploadedByUserId === null ? tTable("unknown") : `#${row.uploadedByUserId}`}
                                    </td>
                                    <td className="hidden px-3 py-2 align-top text-muted-foreground lg:table-cell">
                                        {tTable("unknown")}
                                    </td>
                                    <td className="px-3 py-2 align-top text-muted-foreground">
                                        {row.createdAt ? formatDate(row.createdAt, locale) : tTable("unknown")}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {canLoadMore && (
                <div className="flex justify-center">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onLoadMore}
                        disabled={isLoadingMore}
                        className="h-9 px-6"
                    >
                        {isLoadingMore ? t("loadMoreLoading") : t("loadMore")}
                    </Button>
                </div>
            )}
        </div>
    );
}

interface ThumbnailProps {
    row: AdminMedia;
}

function Thumbnail({ row }: ThumbnailProps) {
    const category = classifyMediaType(row.mime);
    if (category === "image") {
        return (
            // biome-ignore lint/performance/noImgElement: external thumbnails, no Next/Image loader configured
            <img
                src={row.url}
                alt={row.alt ?? row.filename}
                loading="lazy"
                className="size-10 shrink-0 rounded-md border border-border/40 object-cover"
            />
        );
    }
    const Icon = pickIcon(category);
    return (
        <div
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted text-muted-foreground"
            aria-hidden="true"
        >
            <Icon className="size-4" />
        </div>
    );
}

interface HoverActionProps {
    icon: typeof Pencil;
    label: string;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
    tone?: "default" | "danger";
}

function HoverAction({ icon: Icon, label, onClick, tone = "default" }: HoverActionProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-[11px]",
                tone === "danger" ? "text-destructive hover:text-destructive/80" : "text-muted-foreground hover:text-foreground",
            )}
        >
            <Icon className="size-3" aria-hidden="true" />
            {label}
        </button>
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
