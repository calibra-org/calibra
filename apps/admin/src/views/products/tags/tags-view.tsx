"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import type { AdminTag } from "#/lib/types";

import { TaxonomyErrorState, TaxonomyWorkbenchSkeleton } from "../_shared/taxonomy-states";

import { useBulkDeleteTags, useCreateTag, useDeleteTag, useTagsList, useUpdateTag } from "./queries";
import { type AdminTagDraft, TagInspector } from "./tag-inspector";
import { TagsList } from "./tags-list";

export type TagFilterMode = "all" | "popular" | "unused";
export type TagSortKey = "name" | "slug" | "productCount";

export interface TagsStats {
    total: number;
    popular: number;
    unused: number;
    totalAttachments: number;
}

/**
 * Threshold used by the "popular" filter pill and stats. We treat a tag as popular when it
 * is attached to at least this many products. The number is deliberately conservative —
 * tags in this baseline catalog rarely exceed double-digit attachments, so anything ≥ 5
 * already stands out from the long tail.
 */
const POPULAR_THRESHOLD = 5;

const SORT_COMPARATORS: Record<TagSortKey, (a: AdminTag, b: AdminTag, locale: Locale) => number> = {
    name: (a, b, locale) => (a.name[locale] ?? "").localeCompare(b.name[locale] ?? "", locale),
    slug: (a, b, locale) => (a.slug[locale] ?? "").localeCompare(b.slug[locale] ?? "", "en"),
    productCount: (a, b) => a.productCount - b.productCount,
};

/**
 * Page entry point. Fetches the tag list client-side via React Query and renders a workbench
 * skeleton while in flight / a retry-able error state on failure before mounting the workbench.
 */
export function TagsView() {
    const { data, isLoading, isError, refetch } = useTagsList({ limit: 200 });
    if (isLoading || data === undefined) return <TaxonomyWorkbenchSkeleton />;
    if (isError) return <TaxonomyErrorState onRetry={() => void refetch()} />;
    return <TagsWorkbench rows={data.data} />;
}

/**
 * Top-level client workbench. Hosts list + inspector, owns selection / draft / filter state,
 * fires the React Query mutations, and shows a confirm dialog for destructive actions. The
 * product counts arrive from the index `used_count` through {@link useTagsList}.
 */
function TagsWorkbench({ rows }: { rows: AdminTag[] }) {
    const t = useTranslations("Tags");
    const locale = useLocale() as Locale;

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<TagFilterMode>("all");
    const [sortKey, setSortKey] = useState<TagSortKey>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [draft, setDraft] = useState<AdminTagDraft | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

    const selected = useMemo<AdminTagDraft | null>(
        () => (selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null)),
        [rows, selectedId],
    );

    /**
     * Sync the draft with the selected row. When a row goes away (deleted), drop the draft
     * unless we are editing a brand-new (negative-id) tag.
     */
    useEffect(() => {
        if (selected === null) {
            setDraft((current) => (current !== null && current.id < 0 ? current : null));
            return;
        }
        setDraft({ ...selected, description: selected.description ?? { fa: "", en: "" } });
    }, [selected]);

    const stats = useMemo<TagsStats>(() => computeStats(rows), [rows]);
    const visibleRows = useMemo(
        () => filterAndSortRows({ rows, search, filter, sortKey, sortDir, locale }),
        [rows, search, filter, sortKey, sortDir, locale],
    );

    const createMutation = useCreateTag();
    const updateMutation = useUpdateTag();
    const deleteMutation = useDeleteTag();
    const bulkDeleteMutation = useBulkDeleteTags();

    const submitting = createMutation.isPending || updateMutation.isPending;

    const startNew = useCallback(() => {
        setSelectedId(null);
        const sentinelId = -Date.now();
        setDraft({
            id: sentinelId,
            name: { fa: "", en: "" },
            slug: { fa: "", en: "" },
            productCount: 0,
            description: { fa: "", en: "" },
        });
    }, []);

    const handleSelectRow = useCallback((id: number) => setSelectedId(id), []);

    const handleEdit = useCallback((id: number) => setSelectedId(id), []);

    const handleSave = useCallback(
        (next: AdminTagDraft) => {
            const isNew = next.id < 0;
            const description = next.description?.[locale] ?? null;
            if (isNew) {
                createMutation.mutate(
                    {
                        name: next.name[locale] ?? "",
                        slug: next.slug[locale] && next.slug[locale].length > 0 ? next.slug[locale] : null,
                        description,
                    },
                    {
                        onSuccess: (envelope) => {
                            const createdId = envelope.data.id;
                            setSelectedId(createdId);
                            setDraft({
                                id: createdId,
                                name: { fa: envelope.data.name, en: envelope.data.name },
                                slug: { fa: envelope.data.slug, en: envelope.data.slug },
                                productCount: 0,
                                description: next.description,
                            });
                        },
                    },
                );
                return;
            }
            updateMutation.mutate({
                id: next.id,
                name: next.name[locale] ?? "",
                slug: next.slug[locale] ?? "",
                description,
            });
        },
        [createMutation, locale, updateMutation],
    );

    const handleDelete = useCallback((id: number) => {
        setPendingDeleteId(id);
    }, []);

    const confirmDelete = useCallback(() => {
        if (pendingDeleteId === null) return;
        const id = pendingDeleteId;
        deleteMutation.mutate(
            { id },
            {
                onSettled: () => {
                    setPendingDeleteId(null);
                    if (selectedId === id) {
                        setSelectedId(null);
                        setDraft(null);
                    }
                    setSelectedIds((current) => {
                        if (!current.has(id)) return current;
                        const next = new Set(current);
                        next.delete(id);
                        return next;
                    });
                },
            },
        );
    }, [deleteMutation, pendingDeleteId, selectedId]);

    const handleToggleSelected = useCallback((id: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleToggleAllSelected = useCallback(() => {
        setSelectedIds((current) => {
            const allSelected = visibleRows.length > 0 && visibleRows.every((row) => current.has(row.id));
            if (allSelected) {
                const next = new Set(current);
                for (const row of visibleRows) next.delete(row.id);
                return next;
            }
            const next = new Set(current);
            for (const row of visibleRows) next.add(row.id);
            return next;
        });
    }, [visibleRows]);

    const handleClearSelected = useCallback(() => setSelectedIds(new Set()), []);

    const handleBulkDelete = useCallback(() => {
        if (selectedIds.size === 0) return;
        setPendingBulkDelete(true);
    }, [selectedIds.size]);

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
                    if (selectedId !== null && ids.includes(selectedId)) {
                        setSelectedId(null);
                        setDraft(null);
                    }
                    setSelectedIds(new Set());
                },
            },
        );
    }, [bulkDeleteMutation, selectedId, selectedIds]);

    const handleSort = useCallback((key: TagSortKey) => {
        setSortKey((currentKey) => {
            if (currentKey === key) {
                setSortDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
                return key;
            }
            setSortDir(key === "productCount" ? "desc" : "asc");
            return key;
        });
    }, []);

    const handleCloseInspector = useCallback(() => {
        setSelectedId(null);
        setDraft(null);
    }, []);

    const pendingDeleteRow = pendingDeleteId === null ? null : (rows.find((row) => row.id === pendingDeleteId) ?? null);

    return (
        <section className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">
                        {t("subtitleStats", {
                            total: formatNumber(stats.total, locale),
                            attachments: formatNumber(stats.totalAttachments, locale),
                            unused: formatNumber(stats.unused, locale),
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" onClick={startNew}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addTag")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <TagInspector
                        draft={draft}
                        selected={selected}
                        locale={locale}
                        submitting={submitting}
                        onDraftChange={setDraft}
                        onCreateNew={startNew}
                        onSave={handleSave}
                        onDelete={handleDelete}
                        onClose={handleCloseInspector}
                    />
                </aside>

                <TagsList
                    rows={rows}
                    visibleRows={visibleRows}
                    selectedId={selectedId}
                    selectedIds={selectedIds}
                    search={search}
                    filter={filter}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    stats={stats}
                    locale={locale}
                    onSearchChange={setSearch}
                    onFilterChange={setFilter}
                    onSort={handleSort}
                    onSelectRow={handleSelectRow}
                    onToggleSelected={handleToggleSelected}
                    onToggleAllSelected={handleToggleAllSelected}
                    onClearSelected={handleClearSelected}
                    onBulkDelete={handleBulkDelete}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                />
            </div>

            <DeleteOneDialog
                row={pendingDeleteRow}
                locale={locale}
                pending={deleteMutation.isPending}
                onCancel={() => setPendingDeleteId(null)}
                onConfirm={confirmDelete}
            />
            <DeleteBulkDialog
                count={selectedIds.size}
                open={pendingBulkDelete}
                pending={bulkDeleteMutation.isPending}
                locale={locale}
                onCancel={() => setPendingBulkDelete(false)}
                onConfirm={confirmBulkDelete}
            />
        </section>
    );
}

interface DeleteOneDialogProps {
    row: AdminTag | null;
    locale: Locale;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteOneDialog({ row, locale, pending, onCancel, onConfirm }: DeleteOneDialogProps) {
    const t = useTranslations("Tags.deleteDialog");
    const open = row !== null;
    return (
        <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {row !== null && t("description", { name: row.name[locale] || t("untitled") })}
                    </AlertDialogDescription>
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
}

function DeleteBulkDialog({ count, open, pending, locale, onCancel, onConfirm }: DeleteBulkDialogProps) {
    const t = useTranslations("Tags.bulkDeleteDialog");
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

function computeStats(rows: AdminTag[]): TagsStats {
    let total = 0;
    let popular = 0;
    let unused = 0;
    let totalAttachments = 0;
    for (const row of rows) {
        total += 1;
        totalAttachments += row.productCount;
        if (row.productCount >= POPULAR_THRESHOLD) popular += 1;
        if (row.productCount === 0) unused += 1;
    }
    return { total, popular, unused, totalAttachments };
}

interface FilterAndSortInput {
    rows: AdminTag[];
    search: string;
    filter: TagFilterMode;
    sortKey: TagSortKey;
    sortDir: "asc" | "desc";
    locale: Locale;
}

function filterAndSortRows({ rows, search, filter, sortKey, sortDir, locale }: FilterAndSortInput): AdminTag[] {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
        if (filter === "popular" && row.productCount < POPULAR_THRESHOLD) return false;
        if (filter === "unused" && row.productCount !== 0) return false;
        if (term.length === 0) return true;
        const name = (row.name[locale] ?? "").toLowerCase();
        const slug = (row.slug[locale] ?? "").toLowerCase();
        return name.includes(term) || slug.includes(term);
    });
    const comparator = SORT_COMPARATORS[sortKey];
    const sorted = [...filtered].sort((a, b) => comparator(a, b, locale));
    return sortDir === "asc" ? sorted : sorted.reverse();
}
