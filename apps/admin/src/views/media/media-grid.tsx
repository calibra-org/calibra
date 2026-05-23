"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import type { AdminMedia } from "#/lib/types";

import { MediaTile } from "./media-tile";

interface MediaGridProps {
    rows: readonly AdminMedia[];
    selectedIds: ReadonlySet<number>;
    activeId: number | null;
    bulkMode: boolean;
    locale: Locale;
    isLoading: boolean;
    isFiltering: boolean;
    canLoadMore: boolean;
    isLoadingMore: boolean;
    onTileOpen: (row: AdminMedia) => void;
    onTileToggle: (id: number) => void;
    onLoadMore: () => void;
}

/**
 * Grid view. Renders the responsive grid of tiles, plus the "Load more" button when more pages
 * are available. Empty state cases (no data at all vs. filtered to nothing) are surfaced inline
 * because the surrounding card already provides the padding.
 */
export function MediaGrid({
    rows,
    selectedIds,
    activeId,
    bulkMode,
    locale,
    isLoading,
    isFiltering,
    canLoadMore,
    isLoadingMore,
    onTileOpen,
    onTileToggle,
    onLoadMore,
}: MediaGridProps) {
    const t = useTranslations("Media");
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

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {rows.map((row) => (
                    <MediaTile
                        key={row.id}
                        row={row}
                        selected={selectedIds.has(row.id)}
                        isActive={activeId === row.id}
                        bulkMode={bulkMode}
                        onClick={() => (bulkMode ? onTileToggle(row.id) : onTileOpen(row))}
                        onToggleSelect={() => onTileToggle(row.id)}
                    />
                ))}
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

            {isLoading && rows.length === 0 && (
                <p className="text-muted-foreground text-xs">
                    {/** placeholder to keep tabular layout stable while the first page loads */}
                    {t("loadMoreLoading")} · {formatNumber(0, locale)}
                </p>
            )}
        </div>
    );
}
