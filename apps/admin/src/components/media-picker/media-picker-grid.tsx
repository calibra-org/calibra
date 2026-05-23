"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import type { AdminMedia } from "#/lib/types";

import { MediaPickerTile } from "./media-picker-tile";
import type { MediaPickerMode } from "./types";

interface MediaPickerGridProps {
    rows: readonly AdminMedia[];
    selectedIds: readonly number[];
    mode: MediaPickerMode;
    isLoading: boolean;
    isFiltering: boolean;
    canLoadMore: boolean;
    isLoadingMore: boolean;
    onToggle: (id: number) => void;
    onLoadMore: () => void;
}

/**
 * Grid of selectable tiles. Slim version of the workbench {@link MediaGrid}: no bulk mode, no
 * modal open path, no list-view variant — just selection. Empty state copy reuses the workbench's
 * translation bundle so operators see the same messaging across surfaces.
 */
export function MediaPickerGrid({
    rows,
    selectedIds,
    mode,
    isLoading,
    isFiltering,
    canLoadMore,
    isLoadingMore,
    onToggle,
    onLoadMore,
}: MediaPickerGridProps) {
    const t = useTranslations("Media");
    const tEmpty = useTranslations("Media.emptyList");

    if (rows.length === 0 && !isLoading) {
        const key = isFiltering ? "noResults" : "empty";
        return (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-10 text-center">
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

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {rows.map((row) => {
                    const selectionIndex = selectedIds.indexOf(row.id);
                    return (
                        <MediaPickerTile
                            key={row.id}
                            row={row}
                            selected={selectionIndex !== -1}
                            mode={mode}
                            selectionIndex={selectionIndex === -1 ? null : selectionIndex}
                            onToggle={() => onToggle(row.id)}
                        />
                    );
                })}
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
