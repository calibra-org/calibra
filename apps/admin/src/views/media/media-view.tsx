"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { toast } from "#/components/ui/toast";
import { formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import type { AdminMedia, Paginated } from "#/lib/types";

import { MediaBulkBar } from "./media-bulk-bar";
import { MediaDetailsModal } from "./media-details-modal";
import { MediaGrid } from "./media-grid";
import { MediaList } from "./media-list";
import { MediaToolbar } from "./media-toolbar";
import {
    adminMediaListToEnvelope,
    seedMediaListKey,
    useBulkDeleteMedia,
    useDeleteMedia,
    useMediaList,
    useMediaMonths,
    useUpdateMedia,
} from "./queries";
import { buildMonthOptions, classifyMediaType, type MediaTypeFilter, type MediaViewMode } from "./types";
import { UploadDropzone } from "./upload-dropzone";

interface MediaViewProps {
    initialPage: Paginated<AdminMedia>;
    initialMonths: string[];
    initialOpenId?: number;
    initialOpenRow?: AdminMedia;
}

const PER_PAGE = 60;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Top-level client orchestrator for the `/media` workbench. Owns the filter state, the bulk-mode
 * toggle, the selection set, the modal pointer (`activeId`), the prev/next traversal, the
 * upload-dialog visibility, and the two delete-confirm dialogs.
 *
 * URL state is intentionally narrow: only `?view=grid|list` survives reloads (matches the brief).
 * Filters live in local state so they don't pollute the URL — the workbench is a single-page
 * tool, not a deep-linkable filter set.
 */
export function MediaView({ initialPage, initialMonths, initialOpenId, initialOpenRow }: MediaViewProps) {
    const t = useTranslations("Media");
    const tBulk = useTranslations("Media.bulkDeleteDialog");
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    const router = useRouter();
    const searchParams = useSearchParams();

    const initialView: MediaViewMode = searchParams.get("view") === "list" ? "list" : "grid";
    const [view, setView] = useState<MediaViewMode>(initialView);
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [activeId, setActiveId] = useState<number | null>(initialOpenId ?? null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [pendingDeleteRow, setPendingDeleteRow] = useState<AdminMedia | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [type, setType] = useState<MediaTypeFilter>("all");
    const [month, setMonth] = useState("");
    const [perPage, setPerPage] = useState(initialPage.meta.perPage > 0 ? initialPage.meta.perPage : PER_PAGE);

    /**
     * Plant the SSR snapshot into the React Query cache once so the listing hook below doesn't
     * paint empty on first mount. Subsequent fetches (filter change, load-more) hit the live
     * `useMediaList` query and overwrite as needed.
     */
    useEffect(() => {
        const key = seedMediaListKey({ locale, perPage });
        if (queryClient.getQueryData(key) !== undefined) return;
        queryClient.setQueryData(key, adminMediaListToEnvelope(initialPage.data, initialPage.meta));
    }, [initialPage.data, initialPage.meta, locale, perPage, queryClient]);

    useEffect(() => {
        const id = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(id);
    }, [search]);

    /**
     * Filter setters wrap state mutations with a `perPage` reset so the previous "Load more" page
     * window doesn't leak across queries (and bloat the response). Co-locating the reset with the
     * setters is clearer than chasing a separate effect that watches the same state.
     */
    const setSearchWithReset = useCallback((value: string) => {
        setSearch(value);
        setPerPage(PER_PAGE);
    }, []);
    const setTypeWithReset = useCallback((value: MediaTypeFilter) => {
        setType(value);
        setPerPage(PER_PAGE);
    }, []);
    const setMonthWithReset = useCallback((value: string) => {
        setMonth(value);
        setPerPage(PER_PAGE);
    }, []);

    const query = useMediaList({
        perPage,
        search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
        type,
        month,
    });

    const monthsQuery = useMediaMonths();
    const months = useMemo(
        () => buildMonthOptions(query.data?.data ?? initialPage.data, monthsQuery.data ?? initialMonths),
        [query.data?.data, initialPage.data, monthsQuery.data, initialMonths],
    );

    const rows = useMemo(() => {
        if (query.data?.data !== undefined) return query.data.data;
        return initialPage.data;
    }, [query.data?.data, initialPage.data]);

    const total = query.data?.meta.total ?? initialPage.meta.total ?? rows.length;
    const canLoadMore = rows.length < total;

    /**
     * Sync `?view=` to the URL. Use `router.replace` so the back button keeps its normal meaning
     * (return to wherever the operator came from, not cycle through view toggles).
     */
    const updateViewUrl = useCallback(
        (next: MediaViewMode) => {
            const params = new URLSearchParams(searchParams.toString());
            if (next === "grid") params.delete("view");
            else params.set("view", next);
            const queryString = params.toString();
            const pathname = window.location.pathname;
            router.replace((queryString.length > 0 ? `${pathname}?${queryString}` : pathname) as never);
        },
        [router, searchParams],
    );

    const handleViewChange = useCallback(
        (next: MediaViewMode) => {
            setView(next);
            updateViewUrl(next);
        },
        [updateViewUrl],
    );

    const handleToggleSelect = useCallback((id: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleToggleAll = useCallback(() => {
        setSelectedIds((current) => {
            const allSelected = rows.length > 0 && rows.every((row) => current.has(row.id));
            if (allSelected) {
                const next = new Set(current);
                for (const row of rows) next.delete(row.id);
                return next;
            }
            const next = new Set(current);
            for (const row of rows) next.add(row.id);
            return next;
        });
    }, [rows]);

    const handleBulkCancel = useCallback(() => {
        setSelectedIds(new Set());
        setBulkMode(false);
    }, []);

    const handleBulkModeChange = useCallback((next: boolean) => {
        setBulkMode(next);
        if (!next) setSelectedIds(new Set());
    }, []);

    const handleLoadMore = useCallback(() => {
        setPerPage((current) => current + PER_PAGE);
    }, []);

    const handleOpen = useCallback((row: AdminMedia) => setActiveId(row.id), []);
    const handleCloseModal = useCallback(() => setActiveId(null), []);

    const activeRowFromList = useMemo(() => rows.find((row) => row.id === activeId) ?? null, [rows, activeId]);
    const activeRow = activeRowFromList ?? (activeId === initialOpenId && initialOpenRow !== undefined ? initialOpenRow : null);

    const activeIndex = activeRow === null ? -1 : rows.findIndex((row) => row.id === activeRow.id);
    const canPrev = activeIndex > 0;
    const canNext = activeIndex >= 0 && activeIndex < rows.length - 1;

    const handlePrev = useCallback(() => {
        if (activeIndex <= 0) return;
        setActiveId(rows[activeIndex - 1]?.id ?? null);
    }, [activeIndex, rows]);

    const handleNext = useCallback(() => {
        if (activeIndex < 0 || activeIndex >= rows.length - 1) return;
        setActiveId(rows[activeIndex + 1]?.id ?? null);
    }, [activeIndex, rows]);

    const updateMutation = useUpdateMedia();
    const deleteMutation = useDeleteMedia();
    const bulkDeleteMutation = useBulkDeleteMedia();

    const handleModalSave = useCallback(
        async (patch: { title?: string | null; alt?: string | null; caption?: string | null; description?: string | null }) => {
            if (activeRow === null) return;
            await updateMutation.mutateAsync({ id: activeRow.id, ...patch });
        },
        [activeRow, updateMutation],
    );

    const handleModalDelete = useCallback(() => {
        if (activeRow !== null) setPendingDeleteRow(activeRow);
    }, [activeRow]);

    const handleListEdit = useCallback((row: AdminMedia) => setActiveId(row.id), []);
    const handleListDelete = useCallback((row: AdminMedia) => setPendingDeleteRow(row), []);
    const handleListView = useCallback((row: AdminMedia) => {
        window.open(row.url, "_blank", "noopener");
    }, []);
    const handleListCopyUrl = useCallback(
        async (row: AdminMedia) => {
            try {
                await navigator.clipboard.writeText(row.url);
                toast.add({ title: t("modal.copyToast"), timeout: 2000, data: { tone: "success" } });
            } catch {
                toast.add({ title: t("modal.saveFailedToast"), timeout: 3000, data: { tone: "error" } });
            }
        },
        [t],
    );

    const handleListDownload = useCallback((row: AdminMedia) => triggerDownload(row.url, row.filename), []);

    const confirmDelete = useCallback(() => {
        if (pendingDeleteRow === null) return;
        const id = pendingDeleteRow.id;
        deleteMutation.mutate(
            { id },
            {
                onSettled: () => {
                    setPendingDeleteRow(null);
                    if (activeId === id) setActiveId(null);
                    setSelectedIds((current) => {
                        if (!current.has(id)) return current;
                        const next = new Set(current);
                        next.delete(id);
                        return next;
                    });
                },
            },
        );
    }, [activeId, deleteMutation, pendingDeleteRow]);

    const confirmBulkDelete = useCallback(() => {
        const ids = [...selectedIds];
        if (ids.length === 0) {
            setPendingBulkDelete(false);
            return;
        }
        bulkDeleteMutation.mutate(
            { ids },
            {
                onSettled: () => {
                    setPendingBulkDelete(false);
                    if (activeId !== null && ids.includes(activeId)) setActiveId(null);
                    setSelectedIds(new Set());
                    setBulkMode(false);
                },
            },
        );
    }, [activeId, bulkDeleteMutation, selectedIds]);

    /** Counts that drive the header subtitle. Image / file split is derived from the cached rows. */
    const stats = useMemo(() => {
        const images = rows.filter((row) => classifyMediaType(row.mime) === "image").length;
        return {
            total,
            images,
            files: total - images,
        };
    }, [rows, total]);

    const isFiltering = debouncedSearch.length > 0 || type !== "all" || month.length > 0;

    /** Track which row count we have currently rendered so "Load more" knows whether the click landed. */
    const previousPerPage = useRef(perPage);
    const isLoadingMore = query.isFetching && previousPerPage.current !== perPage;
    useEffect(() => {
        if (!query.isFetching) previousPerPage.current = perPage;
    }, [perPage, query.isFetching]);

    return (
        <section className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">
                        {t("subtitleStats", {
                            total: formatNumber(stats.total, locale),
                            images: formatNumber(stats.images, locale),
                            files: formatNumber(stats.files, locale),
                        })}
                    </p>
                </div>
            </header>

            <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                {selectedIds.size > 0 && (
                    <MediaBulkBar
                        count={selectedIds.size}
                        locale={locale}
                        onCancel={handleBulkCancel}
                        onBulkDelete={() => setPendingBulkDelete(true)}
                    />
                )}

                <MediaToolbar
                    search={search}
                    onSearchChange={setSearchWithReset}
                    type={type}
                    onTypeChange={setTypeWithReset}
                    month={month}
                    onMonthChange={setMonthWithReset}
                    months={months}
                    view={view}
                    onViewChange={handleViewChange}
                    bulkMode={bulkMode}
                    onBulkModeChange={handleBulkModeChange}
                    onAdd={() => setUploadOpen(true)}
                    locale={locale}
                />

                {view === "grid" ? (
                    <MediaGrid
                        rows={rows}
                        selectedIds={selectedIds}
                        activeId={activeId}
                        bulkMode={bulkMode}
                        locale={locale}
                        isLoading={query.isPending}
                        isFiltering={isFiltering}
                        canLoadMore={canLoadMore}
                        isLoadingMore={isLoadingMore}
                        onTileOpen={handleOpen}
                        onTileToggle={handleToggleSelect}
                        onLoadMore={handleLoadMore}
                    />
                ) : (
                    <MediaList
                        rows={rows}
                        selectedIds={selectedIds}
                        activeId={activeId}
                        bulkMode={bulkMode}
                        locale={locale}
                        isLoading={query.isPending}
                        isFiltering={isFiltering}
                        canLoadMore={canLoadMore}
                        isLoadingMore={isLoadingMore}
                        onRowOpen={handleOpen}
                        onRowToggle={handleToggleSelect}
                        onToggleAll={handleToggleAll}
                        onEdit={handleListEdit}
                        onDelete={handleListDelete}
                        onView={handleListView}
                        onCopyUrl={handleListCopyUrl}
                        onDownload={handleListDownload}
                        onLoadMore={handleLoadMore}
                    />
                )}

                <FooterCount visible={rows.length} total={total} locale={locale} />
            </div>

            <MediaDetailsModal
                open={activeId !== null}
                row={activeRow}
                locale={locale}
                canPrev={canPrev}
                canNext={canNext}
                saving={updateMutation.isPending}
                deleting={deleteMutation.isPending}
                onClose={handleCloseModal}
                onPrev={handlePrev}
                onNext={handleNext}
                onSave={handleModalSave}
                onDelete={handleModalDelete}
            />

            <UploadDropzone open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => undefined} />

            <DeleteOneDialog
                row={pendingDeleteRow}
                pending={deleteMutation.isPending}
                onCancel={() => setPendingDeleteRow(null)}
                onConfirm={confirmDelete}
            />
            <DeleteBulkDialog
                count={selectedIds.size}
                open={pendingBulkDelete}
                pending={bulkDeleteMutation.isPending}
                locale={locale}
                onCancel={() => setPendingBulkDelete(false)}
                onConfirm={confirmBulkDelete}
                t={tBulk}
            />
        </section>
    );
}

interface FooterCountProps {
    visible: number;
    total: number;
    locale: Locale;
}

function FooterCount({ visible, total, locale }: FooterCountProps) {
    const t = useTranslations("Media");
    if (total === 0) return null;
    if (visible >= total) {
        return <p className="text-muted-foreground text-xs">{t("footerCount.total", { total: formatNumber(total, locale) })}</p>;
    }
    return (
        <p className="text-muted-foreground text-xs">
            {t("footerCount.partial", { visible: formatNumber(visible, locale), total: formatNumber(total, locale) })}
        </p>
    );
}

interface DeleteOneDialogProps {
    row: AdminMedia | null;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteOneDialog({ row, pending, onCancel, onConfirm }: DeleteOneDialogProps) {
    const t = useTranslations("Media.deleteDialog");
    return (
        <AlertDialog open={row !== null} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("title")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("description")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                        {t("cancel")}
                    </Button>
                    <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        {pending ? t("pending") : t("confirm")}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

interface DeleteBulkDialogProps {
    count: number;
    open: boolean;
    pending: boolean;
    locale: Locale;
    onCancel: () => void;
    onConfirm: () => void;
    t: ReturnType<typeof useTranslations<"Media.bulkDeleteDialog">>;
}

function DeleteBulkDialog({ count, open, pending, locale, onCancel, onConfirm, t }: DeleteBulkDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("title", { count: formatNumber(count, locale) })}</AlertDialogTitle>
                    <AlertDialogDescription>{t("description")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                        {t("cancel")}
                    </Button>
                    <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        {pending ? t("pending") : t("confirm")}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/**
 * Trigger a browser download for the given URL with the supplied filename. Creates a hidden
 * `<a download>`, clicks it, then removes the node from the DOM. Works for both same-origin and
 * cross-origin URLs that allow `Content-Disposition` headers.
 */
function triggerDownload(url: string, filename: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

/* Suppress unused-import warnings when the icons are only consumed inside dialogs/buttons. */
void Download;
