"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
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
import type { AdminAttribute } from "#/lib/types";

import { type AdminAttributeDraft, AttributeInspector } from "./attribute-inspector";
import { AttributesList } from "./attributes-list";
import {
    seedAttributesListKey,
    useAttributesList,
    useBulkDeleteAttributes,
    useCreateAttribute,
    useDeleteAttribute,
    useUpdateAttribute,
} from "./queries";

export type AttributeSortKey = "name" | "slug" | "termCount";

export interface AttributesStats {
    total: number;
    totalTerms: number;
}

interface AttributesViewProps {
    initialRows: AdminAttribute[];
    termPreviews: Record<number, string[]>;
    termCounts: Record<number, number>;
}

const SORT_COMPARATORS: Record<AttributeSortKey, (a: AdminAttribute, b: AdminAttribute, locale: Locale) => number> = {
    name: (a, b, locale) => (a.name[locale] ?? "").localeCompare(b.name[locale] ?? "", locale),
    slug: (a, b) => a.code.localeCompare(b.code, "en"),
    termCount: (a, b) => a.termCount - b.termCount,
};

/**
 * Top-level client component. Hosts the attribute list + inspector, owns selection / draft /
 * filter state, fires React Query mutations, and shows a confirm dialog for destructive
 * actions. Term previews come from SSR — refetches after a mutation lose them until the next
 * full reload (acceptable for this surface, the previews are decorative).
 */
export function AttributesView({ initialRows, termPreviews, termCounts }: AttributesViewProps) {
    const t = useTranslations("Attributes");
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();

    useEffect(() => {
        const key = seedAttributesListKey({ locale, perPage: 200 });
        const existing = queryClient.getQueryData(key);
        if (existing !== undefined) return;
        queryClient.setQueryData(key, {
            data: initialRows.map((row) => ({
                id: row.id,
                code: row.code,
                order_by: row.orderBy,
                has_archives: row.hasArchives,
                name: row.name[locale],
                locale,
            })),
            meta: { page: 1, perPage: 200, total: initialRows.length, lastPage: 1 },
        });
        /** Side cache for term counts — see brands/tags views for the same pattern. */
        queryClient.setQueryData(["admin", "attributes", "counts", locale], termCounts);
    }, [initialRows, termCounts, locale, queryClient]);

    const query = useAttributesList({ perPage: 200 });
    const counts = queryClient.getQueryData<Record<number, number>>(["admin", "attributes", "counts", locale]) ?? termCounts;

    const rows = useMemo<AdminAttribute[]>(() => {
        const liveRows = query.data ?? initialRows;
        return liveRows.map((row) => {
            const fallback = counts[row.id];
            if (fallback === undefined) return row;
            return { ...row, termCount: row.termCount > 0 ? row.termCount : fallback };
        });
    }, [counts, initialRows, query.data]);

    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<AttributeSortKey>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [draft, setDraft] = useState<AdminAttributeDraft | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

    const selected = useMemo<AdminAttributeDraft | null>(() => {
        if (selectedId === null) return null;
        const row = rows.find((r) => r.id === selectedId);
        if (row === undefined) return null;
        return { ...row, nameDraft: row.name };
    }, [rows, selectedId]);

    useEffect(() => {
        if (selected === null) {
            setDraft((current) => (current !== null && current.id < 0 ? current : null));
            return;
        }
        setDraft(selected);
    }, [selected]);

    const stats = useMemo<AttributesStats>(() => {
        let totalTerms = 0;
        for (const row of rows) totalTerms += row.termCount;
        return { total: rows.length, totalTerms };
    }, [rows]);

    const visibleRows = useMemo(
        () => filterAndSortRows({ rows, search, sortKey, sortDir, locale }),
        [rows, search, sortKey, sortDir, locale],
    );

    const createMutation = useCreateAttribute();
    const updateMutation = useUpdateAttribute();
    const deleteMutation = useDeleteAttribute();
    const bulkDeleteMutation = useBulkDeleteAttributes();
    const submitting = createMutation.isPending || updateMutation.isPending;

    const startNew = useCallback(() => {
        setSelectedId(null);
        const sentinelId = -Date.now();
        setDraft({
            id: sentinelId,
            code: "",
            name: { fa: "", en: "" },
            nameDraft: { fa: "", en: "" },
            termCount: 0,
            orderBy: "menu_order",
            hasArchives: false,
        });
    }, []);

    const handleSelectRow = useCallback((id: number) => setSelectedId(id), []);
    const handleEdit = useCallback((id: number) => setSelectedId(id), []);

    const handleSave = useCallback(
        (next: AdminAttributeDraft) => {
            const isNew = next.id < 0;
            const name = next.nameDraft[locale] ?? "";
            if (isNew) {
                createMutation.mutate(
                    {
                        name,
                        code: next.code,
                        hasArchives: next.hasArchives,
                        orderBy: next.orderBy,
                    },
                    {
                        onSuccess: (envelope) => {
                            const createdId = envelope.data.id;
                            setSelectedId(createdId);
                        },
                    },
                );
                return;
            }
            updateMutation.mutate({
                id: next.id,
                name,
                hasArchives: next.hasArchives,
                orderBy: next.orderBy,
            });
        },
        [createMutation, locale, updateMutation],
    );

    const handleDelete = useCallback((id: number) => setPendingDeleteId(id), []);

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

    const handleSort = useCallback((key: AttributeSortKey) => {
        setSortKey((currentKey) => {
            if (currentKey === key) {
                setSortDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
                return key;
            }
            setSortDir(key === "termCount" ? "desc" : "asc");
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
                            terms: formatNumber(stats.totalTerms, locale),
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" onClick={startNew}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addAttribute")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <AttributeInspector
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

                <AttributesList
                    rows={rows}
                    visibleRows={visibleRows}
                    termPreviews={termPreviews}
                    selectedId={selectedId}
                    selectedIds={selectedIds}
                    search={search}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    locale={locale}
                    onSearchChange={setSearch}
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
    row: AdminAttribute | null;
    locale: Locale;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteOneDialog({ row, locale, pending, onCancel, onConfirm }: DeleteOneDialogProps) {
    const t = useTranslations("Attributes.deleteDialog");
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
    const t = useTranslations("Attributes.bulkDeleteDialog");
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

interface FilterAndSortInput {
    rows: AdminAttribute[];
    search: string;
    sortKey: AttributeSortKey;
    sortDir: "asc" | "desc";
    locale: Locale;
}

function filterAndSortRows({ rows, search, sortKey, sortDir, locale }: FilterAndSortInput): AdminAttribute[] {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
        if (term.length === 0) return true;
        const name = (row.name[locale] ?? "").toLowerCase();
        const code = row.code.toLowerCase();
        return name.includes(term) || code.includes(term);
    });
    const comparator = SORT_COMPARATORS[sortKey];
    const sorted = [...filtered].sort((a, b) => comparator(a, b, locale));
    return sortDir === "asc" ? sorted : sorted.reverse();
}
