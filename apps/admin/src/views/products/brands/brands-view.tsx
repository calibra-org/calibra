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
import type { AdminBrand } from "#/lib/types";

import { TaxonomyErrorState, TaxonomyWorkbenchSkeleton } from "../_shared/taxonomy-states";

import { type AdminBrandDraft, BrandInspector } from "./brand-inspector";
import { BrandsList } from "./brands-list";
import { useBrandsList, useBulkDeleteBrands, useCreateBrand, useDeleteBrand, useUpdateBrand } from "./queries";

export type BrandFilterMode = "all" | "withProducts" | "empty";
export type BrandSortKey = "name" | "slug" | "productCount";

export interface BrandsStats {
    total: number;
    withProducts: number;
    empty: number;
    totalAttachments: number;
}

const SORT_COMPARATORS: Record<BrandSortKey, (a: AdminBrand, b: AdminBrand, locale: Locale) => number> = {
    name: (a, b, locale) => (a.name[locale] ?? "").localeCompare(b.name[locale] ?? "", locale),
    slug: (a, b, locale) => (a.slug[locale] ?? "").localeCompare(b.slug[locale] ?? "", "en"),
    productCount: (a, b) => a.productCount - b.productCount,
};

/**
 * Page entry point. Fetches the brand list client-side via React Query and renders a workbench
 * skeleton while in flight / a retry-able error state on failure before mounting the workbench.
 */
export function BrandsView() {
    const { data, isLoading, isError, refetch } = useBrandsList({ limit: 200 });
    if (isLoading || data === undefined) return <TaxonomyWorkbenchSkeleton />;
    if (isError) return <TaxonomyErrorState onRetry={() => void refetch()} />;
    return <BrandsWorkbench rows={data.data} />;
}

/**
 * Top-level client workbench. Hosts the list + inspector, owns selection / draft / filter
 * state, fires React Query mutations, and shows a confirm dialog for destructive actions. The
 * product counts arrive from the index `used_count` through {@link useBrandsList}.
 *
 * Brands are flat (no `parent_id`) at the API today — the table schema does not carry
 * hierarchy and the brand validator rejects unknown fields. Treat this surface like Tags, not
 * Categories. Adding hierarchy is a separate effort that needs an API migration first.
 */
function BrandsWorkbench({ rows }: { rows: AdminBrand[] }) {
    const t = useTranslations("Brands");
    const locale = useLocale() as Locale;

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<BrandFilterMode>("all");
    const [sortKey, setSortKey] = useState<BrandSortKey>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [draft, setDraft] = useState<AdminBrandDraft | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

    const selected = useMemo<AdminBrandDraft | null>(
        () => (selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null)),
        [rows, selectedId],
    );

    /**
     * Sync the draft with the selected row. When a row goes away (deleted), drop the draft
     * unless we are editing a brand-new (negative-id) brand.
     */
    useEffect(() => {
        if (selected === null) {
            setDraft((current) => (current !== null && current.id < 0 ? current : null));
            return;
        }
        setDraft({ ...selected, description: selected.description ?? { fa: "", en: "" } });
    }, [selected]);

    const stats = useMemo<BrandsStats>(() => computeStats(rows), [rows]);
    const visibleRows = useMemo(
        () => filterAndSortRows({ rows, search, filter, sortKey, sortDir, locale }),
        [rows, search, filter, sortKey, sortDir, locale],
    );

    const createMutation = useCreateBrand();
    const updateMutation = useUpdateBrand();
    const deleteMutation = useDeleteBrand();
    const bulkDeleteMutation = useBulkDeleteBrands();

    const submitting = createMutation.isPending || updateMutation.isPending;

    const startNew = useCallback(() => {
        setSelectedId(null);
        const sentinelId = -Date.now();
        setDraft({
            id: sentinelId,
            name: { fa: "", en: "" },
            slug: { fa: "", en: "" },
            productCount: 0,
            imageMediaId: null,
            logoUrl: null,
            description: { fa: "", en: "" },
        });
    }, []);

    const handleSelectRow = useCallback((id: number) => setSelectedId(id), []);
    const handleEdit = useCallback((id: number) => setSelectedId(id), []);

    const handleSave = useCallback(
        (next: AdminBrandDraft) => {
            const isNew = next.id < 0;
            const description = next.description?.[locale] ?? null;
            if (isNew) {
                createMutation.mutate(
                    {
                        name: next.name[locale] ?? "",
                        slug: next.slug[locale] && next.slug[locale].length > 0 ? next.slug[locale] : null,
                        description,
                        imageMediaId: next.imageMediaId,
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
                                imageMediaId: envelope.data.image_media_id ?? null,
                                logoUrl: envelope.data.image_url ?? null,
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
                imageMediaId: next.imageMediaId,
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

    const handleSort = useCallback((key: BrandSortKey) => {
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
                            unused: formatNumber(stats.empty, locale),
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" onClick={startNew}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addBrand")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <BrandInspector
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

                <BrandsList
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
    row: AdminBrand | null;
    locale: Locale;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteOneDialog({ row, locale, pending, onCancel, onConfirm }: DeleteOneDialogProps) {
    const t = useTranslations("Brands.deleteDialog");
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
    const t = useTranslations("Brands.bulkDeleteDialog");
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

function computeStats(rows: AdminBrand[]): BrandsStats {
    let total = 0;
    let withProducts = 0;
    let empty = 0;
    let totalAttachments = 0;
    for (const row of rows) {
        total += 1;
        totalAttachments += row.productCount;
        if (row.productCount > 0) withProducts += 1;
        else empty += 1;
    }
    return { total, withProducts, empty, totalAttachments };
}

interface FilterAndSortInput {
    rows: AdminBrand[];
    search: string;
    filter: BrandFilterMode;
    sortKey: BrandSortKey;
    sortDir: "asc" | "desc";
    locale: Locale;
}

function filterAndSortRows({ rows, search, filter, sortKey, sortDir, locale }: FilterAndSortInput): AdminBrand[] {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
        if (filter === "withProducts" && row.productCount === 0) return false;
        if (filter === "empty" && row.productCount !== 0) return false;
        if (term.length === 0) return true;
        const name = (row.name[locale] ?? "").toLowerCase();
        const slug = (row.slug[locale] ?? "").toLowerCase();
        return name.includes(term) || slug.includes(term);
    });
    const comparator = SORT_COMPARATORS[sortKey];
    const sorted = [...filtered].sort((a, b) => comparator(a, b, locale));
    return sortDir === "asc" ? sorted : sorted.reverse();
}
