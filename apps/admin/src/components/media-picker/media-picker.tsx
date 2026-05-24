"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { formatNumber } from "#/lib/format";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";
import { useMediaList, useMediaMonths } from "#/views/media/queries";
import { buildMonthOptions, type MediaTypeFilter } from "#/views/media/types";
import { UploadDropzone } from "#/views/media/upload-dropzone";

import { MediaPickerGrid } from "./media-picker-grid";
import { MediaPickerToolbar } from "./media-picker-toolbar";
import { hasSelection, type MediaPickerMode, selectionFromValue, selectionToRows, toggleSelection } from "./types";

interface MediaPickerProps {
    open: boolean;
    mode: MediaPickerMode;
    /** Currently-attached media ids — preselected when the picker opens. Single mode reads index 0. */
    value: number | number[] | null;
    onOpenChange: (next: boolean) => void;
    /** Resolves with the operator's selection on confirm. Single mode emits one row, multi an array. */
    onSelect: (selection: AdminMedia | AdminMedia[]) => void;
}

const PER_PAGE = 60;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Modal media picker. Two tabs:
 *
 *   - "Library" (default) — the workbench grid (search + type + month filters) in selection mode.
 *   - "Upload" — opens the workbench's `UploadDropzone` as a stacked dialog over the picker; on
 *     successful upload the new row is autoselected, the dropzone closes itself, and the picker
 *     stays open so the operator can confirm.
 *
 * Selection state lives here and resets on every open. Confirm dispatches `onSelect` with a
 * single {@link AdminMedia} (single mode) or an ordered array (multi mode).
 */
export function MediaPicker({ open, mode, value, onOpenChange, onSelect }: MediaPickerProps) {
    const t = useTranslations("MediaPicker");
    const tFooter = useTranslations("MediaPicker.footer");
    const locale = useLocale() as Locale;

    const [tab, setTab] = useState<"library" | "upload">("library");
    const [selectedIds, setSelectedIds] = useState<number[]>(() => selectionFromValue(value));
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [type, setType] = useState<MediaTypeFilter>("all");
    const [month, setMonth] = useState("");
    const [perPage, setPerPage] = useState(PER_PAGE);

    /** Reset state every time the dialog opens so a stale selection doesn't leak between rows. */
    useEffect(() => {
        if (!open) return;
        setTab("library");
        setSelectedIds(selectionFromValue(value));
        setSearch("");
        setDebouncedSearch("");
        setType("all");
        setMonth("");
        setPerPage(PER_PAGE);
    }, [open, value]);

    useEffect(() => {
        const id = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(id);
    }, [search]);

    const setSearchWithReset = useCallback((next: string) => {
        setSearch(next);
        setPerPage(PER_PAGE);
    }, []);
    const setTypeWithReset = useCallback((next: MediaTypeFilter) => {
        setType(next);
        setPerPage(PER_PAGE);
    }, []);
    const setMonthWithReset = useCallback((next: string) => {
        setMonth(next);
        setPerPage(PER_PAGE);
    }, []);

    const query = useMediaList({
        perPage,
        search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
        type,
        month,
    });
    const monthsQuery = useMediaMonths();
    const rows = query.data?.data ?? [];
    const months = useMemo(() => buildMonthOptions(rows, monthsQuery.data ?? []), [rows, monthsQuery.data]);

    const total = query.data?.meta.total ?? rows.length;
    const canLoadMore = rows.length < total;

    const previousPerPage = useRef(perPage);
    const isLoadingMore = query.isFetching && previousPerPage.current !== perPage;
    useEffect(() => {
        if (!query.isFetching) previousPerPage.current = perPage;
    }, [perPage, query.isFetching]);

    const isFiltering = debouncedSearch.length > 0 || type !== "all" || month.length > 0;

    const handleToggle = useCallback(
        (id: number) => {
            setSelectedIds((current) => toggleSelection(current, id, mode));
        },
        [mode],
    );

    const handleLoadMore = useCallback(() => {
        setPerPage((current) => current + PER_PAGE);
    }, []);

    const handleUploaded = useCallback(
        (row: AdminMedia) => {
            setSelectedIds((current) => {
                if (mode === "single") return [row.id];
                if (current.includes(row.id)) return current;
                return [...current, row.id];
            });
        },
        [mode],
    );

    const handleUploadClose = useCallback(() => {
        setTab("library");
    }, []);

    const handleConfirm = useCallback(() => {
        const resolved = selectionToRows(selectedIds, rows);
        if (resolved.length === 0) return;
        if (mode === "single") {
            const first = resolved[0];
            if (first === undefined) return;
            onSelect(first);
        } else {
            onSelect(resolved);
        }
        onOpenChange(false);
    }, [mode, onOpenChange, onSelect, rows, selectedIds]);

    const handleCancel = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    const footerLabel = (() => {
        if (selectedIds.length === 0) return tFooter("empty");
        if (mode === "single") return tFooter("selectedSingle");
        return tFooter("selectedMultiple", { count: formatNumber(selectedIds.length, locale) });
    })();

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="grid max-w-4xl gap-4">
                    <DialogTitle className="text-base">{mode === "single" ? t("titleSingle") : t("titleMultiple")}</DialogTitle>

                    <div className="flex items-center justify-between">
                        <SegmentTabs
                            value={tab}
                            onChange={setTab}
                            labels={{ library: t("tabs.library"), upload: t("tabs.upload") }}
                        />
                    </div>

                    <MediaPickerToolbar
                        search={search}
                        onSearchChange={setSearchWithReset}
                        type={type}
                        onTypeChange={setTypeWithReset}
                        month={month}
                        onMonthChange={setMonthWithReset}
                        months={months}
                        locale={locale}
                    />
                    <div className="max-h-[55vh] overflow-y-auto pe-1">
                        <MediaPickerGrid
                            rows={rows}
                            selectedIds={selectedIds}
                            mode={mode}
                            isLoading={query.isPending}
                            isFiltering={isFiltering}
                            canLoadMore={canLoadMore}
                            isLoadingMore={isLoadingMore}
                            onToggle={handleToggle}
                            onLoadMore={handleLoadMore}
                        />
                    </div>

                    <footer className="flex items-center justify-between gap-3 border-border/60 border-t pt-3">
                        <span className="text-muted-foreground text-sm">{footerLabel}</span>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={handleCancel}>
                                {t("buttons.cancel")}
                            </Button>
                            <Button type="button" onClick={handleConfirm} disabled={!hasSelection(selectedIds)}>
                                {t("buttons.select")}
                            </Button>
                        </div>
                    </footer>
                </DialogContent>
            </Dialog>

            <UploadDropzone open={open && tab === "upload"} onClose={handleUploadClose} onUploaded={handleUploaded} />
        </>
    );
}

interface SegmentTabsProps {
    value: "library" | "upload";
    onChange: (next: "library" | "upload") => void;
    labels: { library: string; upload: string };
}

/**
 * Segmented "Library / Upload" toggle. Plain buttons instead of the {@link Tabs} primitive because
 * the "Upload" tab opens a stacked dialog rather than rendering an in-place panel — the Tabs
 * indicator semantics don't match a tab that exits to a sibling modal.
 */
function SegmentTabs({ value, onChange, labels }: SegmentTabsProps) {
    return (
        <div className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5" role="tablist">
            <TabButton active={value === "library"} onClick={() => onChange("library")}>
                {labels.library}
            </TabButton>
            <TabButton active={value === "upload"} onClick={() => onChange("upload")} icon={<Upload className="size-3.5" />}>
                {labels.upload}
            </TabButton>
        </div>
    );
}

interface TabButtonProps {
    active: boolean;
    icon?: React.ReactNode;
    children: React.ReactNode;
    onClick: () => void;
}

function TabButton({ active, icon, children, onClick }: TabButtonProps) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded px-3 font-medium text-sm transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
        >
            {icon}
            {children}
        </button>
    );
}
