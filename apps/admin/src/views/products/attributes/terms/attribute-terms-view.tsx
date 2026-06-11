"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
import { Link } from "#/lib/i18n/navigation";
import { useAttribute } from "#/lib/queries/attributes";
import type { AdminAttribute, AdminAttributeTerm } from "#/lib/types";

import { TaxonomyErrorState, TaxonomyWorkbenchSkeleton } from "../../_shared/taxonomy-states";

import {
    useAttributeTermsList,
    useBulkDeleteAttributeTerms,
    useCreateAttributeTerm,
    useDeleteAttributeTerm,
    useUpdateAttributeTerm,
} from "./queries";
import { type AdminAttributeTermDraft, TermInspector } from "./term-inspector";
import { TermsList } from "./terms-list";

export type TermSortKey = "name" | "slug";

interface AttributeTermsViewProps {
    attributeId: number;
}

const SORT_COMPARATORS: Record<TermSortKey, (a: AdminAttributeTerm, b: AdminAttributeTerm, locale: Locale) => number> = {
    name: (a, b, locale) => (a.name[locale] ?? "").localeCompare(b.name[locale] ?? "", locale),
    slug: (a, b) => a.slug.localeCompare(b.slug, "en"),
};

/**
 * Page entry point. Resolves the attribute and its terms client-side through the admin proxy.
 * Renders a workbench skeleton while either request is in flight, a retry-able error state on
 * failure, and a not-found state when the attribute does not exist — then mounts the workbench.
 */
export function AttributeTermsView({ attributeId }: AttributeTermsViewProps) {
    const attribute = useAttribute(attributeId);
    const terms = useAttributeTermsList({ attributeId, limit: 200 });

    if (attribute.isLoading || terms.isLoading || attribute.data === undefined || terms.data === undefined) {
        return <TaxonomyWorkbenchSkeleton />;
    }
    if (attribute.isError || terms.isError) {
        return (
            <TaxonomyErrorState
                onRetry={() => {
                    void attribute.refetch();
                    void terms.refetch();
                }}
            />
        );
    }
    return <AttributeTermsWorkbench attribute={attribute.data} initialRows={terms.data} />;
}

interface AttributeTermsWorkbenchProps {
    attribute: AdminAttribute;
    initialRows: AdminAttributeTerm[];
}

/**
 * Top-level client workbench for the per-attribute terms page. Mirrors the Tags workbench
 * shape — flat list + inspector with optimistic CRUD via React Query. Selection lifts to the
 * parent so the inspector reacts to row clicks without an extra mount.
 */
function AttributeTermsWorkbench({ attribute, initialRows }: AttributeTermsWorkbenchProps) {
    const t = useTranslations("AttributeTerms");
    const locale = useLocale() as Locale;

    const query = useAttributeTermsList({ attributeId: attribute.id, limit: 200 });
    const rows = query.data ?? initialRows;

    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<TermSortKey>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
    const [draft, setDraft] = useState<AdminAttributeTermDraft | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
    const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

    const selected = useMemo<AdminAttributeTermDraft | null>(
        () => (selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null)),
        [rows, selectedId],
    );

    useEffect(() => {
        if (selected === null) {
            setDraft((current) => (current !== null && current.id < 0 ? current : null));
            return;
        }
        setDraft({ ...selected, description: selected.description ?? { fa: "", en: "" } });
    }, [selected]);

    const visibleRows = useMemo(
        () => filterAndSortRows({ rows, search, sortKey, sortDir, locale }),
        [rows, search, sortKey, sortDir, locale],
    );

    const createMutation = useCreateAttributeTerm();
    const updateMutation = useUpdateAttributeTerm();
    const deleteMutation = useDeleteAttributeTerm();
    const bulkDeleteMutation = useBulkDeleteAttributeTerms();
    const submitting = createMutation.isPending || updateMutation.isPending;

    const startNew = useCallback(() => {
        setSelectedId(null);
        const sentinelId = -Date.now();
        setDraft({
            id: sentinelId,
            attributeId: attribute.id,
            name: { fa: "", en: "" },
            slug: "",
            description: { fa: "", en: "" },
        });
    }, [attribute.id]);

    const handleSelectRow = useCallback((id: number) => setSelectedId(id), []);
    const handleEdit = useCallback((id: number) => setSelectedId(id), []);

    const handleSave = useCallback(
        (next: AdminAttributeTermDraft) => {
            const isNew = next.id < 0;
            const description = next.description?.[locale] ?? null;
            const name = next.name[locale] ?? "";
            if (isNew) {
                createMutation.mutate(
                    {
                        attributeId: attribute.id,
                        name,
                        slug: next.slug.length > 0 ? next.slug : null,
                        description,
                    },
                    {
                        onSuccess: (envelope) => {
                            const createdId = envelope.data.id;
                            setSelectedId(createdId);
                            setDraft({
                                id: createdId,
                                attributeId: attribute.id,
                                name: { fa: envelope.data.name, en: envelope.data.name },
                                slug: envelope.data.slug,
                                description: next.description,
                            });
                        },
                    },
                );
                return;
            }
            updateMutation.mutate({
                attributeId: attribute.id,
                id: next.id,
                name,
                slug: next.slug,
                description,
            });
        },
        [attribute.id, createMutation, locale, updateMutation],
    );

    const handleDelete = useCallback((id: number) => setPendingDeleteId(id), []);

    const confirmDelete = useCallback(() => {
        if (pendingDeleteId === null) return;
        const id = pendingDeleteId;
        deleteMutation.mutate(
            { attributeId: attribute.id, id },
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
    }, [attribute.id, deleteMutation, pendingDeleteId, selectedId]);

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
            { attributeId: attribute.id, ids },
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
    }, [attribute.id, bulkDeleteMutation, selectedId, selectedIds]);

    const handleSort = useCallback((key: TermSortKey) => {
        setSortKey((currentKey) => {
            if (currentKey === key) {
                setSortDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
                return key;
            }
            setSortDir("asc");
            return key;
        });
    }, []);

    const handleCloseInspector = useCallback(() => {
        setSelectedId(null);
        setDraft(null);
    }, []);

    const pendingDeleteRow = pendingDeleteId === null ? null : (rows.find((row) => row.id === pendingDeleteId) ?? null);
    const attributeName = attribute.name[locale] || attribute.code;

    return (
        <section className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                    <Button
                        asChild
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-fit gap-1 px-2 text-muted-foreground"
                    >
                        <Link href="/products/attributes">
                            <ArrowLeft className="size-3.5" data-rtl-flip aria-hidden="true" />
                            {t("backToAttributes")}
                        </Link>
                    </Button>
                    <div className="flex flex-col gap-1">
                        <h1 className="font-semibold text-2xl tracking-tight">{t("titleFor", { name: attributeName })}</h1>
                        <p className="text-muted-foreground text-sm">
                            {t("subtitleStats", { total: formatNumber(rows.length, locale) })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" onClick={startNew}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addTerm")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <TermInspector
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

                <TermsList
                    rows={rows}
                    visibleRows={visibleRows}
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
    row: AdminAttributeTerm | null;
    locale: Locale;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteOneDialog({ row, locale, pending, onCancel, onConfirm }: DeleteOneDialogProps) {
    const t = useTranslations("AttributeTerms.deleteDialog");
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
    const t = useTranslations("AttributeTerms.bulkDeleteDialog");
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
    rows: AdminAttributeTerm[];
    search: string;
    sortKey: TermSortKey;
    sortDir: "asc" | "desc";
    locale: Locale;
}

function filterAndSortRows({ rows, search, sortKey, sortDir, locale }: FilterAndSortInput): AdminAttributeTerm[] {
    const term = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
        if (term.length === 0) return true;
        const name = (row.name[locale] ?? "").toLowerCase();
        const slug = row.slug.toLowerCase();
        return name.includes(term) || slug.includes(term);
    });
    const comparator = SORT_COMPARATORS[sortKey];
    const sorted = [...filtered].sort((a, b) => comparator(a, b, locale));
    return sortDir === "asc" ? sorted : sorted.reverse();
}
