"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronsDownUp, ChevronsUpDown, FolderPlus, LayoutList, ListTree, Search, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { formatNumber } from "#/lib/format";
import type { AdminCategory } from "#/lib/types";
import { cn } from "#/lib/utils";

import { flattenCategoryTree } from "./build-tree";
import { type AdminCategoryLike, CategoryInspector } from "./category-inspector";
import { CategoryTree } from "./category-tree";
import { useCategoriesTree } from "./use-categories-tree";

interface CategoriesViewProps {
    initialRows: AdminCategory[];
}

/** Filter pills above the tree — used as quick visual subsetters, not query parameters. */
type FilterMode = "all" | "topLevel" | "withProducts" | "empty";

/**
 * Top-level client component for the Categories management page. Hosts the tree (left), the
 * inspector (right), the toolbar that filters and bulk-toggles the tree, and the dnd-kit
 * controller that wires drag events into the tree state.
 *
 * Persistence model:
 *
 *   - Tree mutations (move / rename / delete) update local state optimistically. Once the API
 *     grows the matching write endpoints, the mutation hooks in `./queries.ts` take over and
 *     this component starts firing them inside `onSave` / `onDelete` / drag-end.
 *   - The server-rendered page hands us a hydrated row list; we never refetch on mount, so the
 *     initial paint matches SSR pixel-for-pixel and avoids a flash.
 */
export function CategoriesView({ initialRows }: CategoriesViewProps) {
    const t = useTranslations("Categories");
    const locale = useLocale() as Locale;

    const tree = useCategoriesTree({ initialRows });
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterMode>("all");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [draft, setDraft] = useState<AdminCategoryLike | null>(null);

    const selected = useMemo<AdminCategoryLike | null>(
        () => (selectedId === null ? null : (tree.rows.find((r) => r.id === selectedId) ?? null)),
        [selectedId, tree.rows],
    );

    /**
     * Sync the inspector draft with the selected row. Edits propagate locally until the user
     * hits Save — at which point we commit to `tree.upsert` and the draft re-syncs from the
     * fresh source-of-truth row.
     */
    useEffect(() => {
        if (selected === null) {
            setDraft(null);
            return;
        }
        setDraft({ ...selected, description: selected.description ?? { fa: "", en: "" } });
    }, [selected]);

    const stats = useMemo(() => computeStats(tree.rows), [tree.rows]);

    const filteredFlatRows = useMemo(() => {
        if (search.length === 0 && filter === "all") {
            return tree.flatRowsForDrag;
        }
        /**
         * Filtering is computed against the *full* tree (not the post-collapse one), so a
         * search match always shows the matching row even if its parent was collapsed. We
         * recompute the flat list with all parents of matches expanded and everyone else as
         * they were.
         */
        const term = search.trim().toLowerCase();
        const allFlat = flattenCategoryTree(tree.rows, null);
        const matches = new Set<number>();
        const parents = new Map<number, number | null>();
        for (const row of allFlat) parents.set(row.category.id, row.category.parentId);
        for (const row of allFlat) {
            const matchesFilter =
                filter === "all"
                    ? true
                    : filter === "topLevel"
                      ? row.depth === 0
                      : filter === "withProducts"
                        ? row.category.productCount > 0
                        : row.category.productCount === 0 && !row.hasChildren;
            if (!matchesFilter) continue;
            if (term.length > 0) {
                const haystack = `${row.category.name[locale] ?? ""} ${row.category.slug[locale] ?? ""}`.toLowerCase();
                if (!haystack.includes(term)) continue;
            }
            matches.add(row.category.id);
            /** Walk up so the match remains visible inside its breadcrumb. */
            let parentId = parents.get(row.category.id);
            while (parentId !== undefined && parentId !== null) {
                matches.add(parentId);
                parentId = parents.get(parentId);
            }
        }
        return allFlat.filter((row) => matches.has(row.category.id));
    }, [tree.rows, tree.flatRowsForDrag, search, filter, locale]);

    const handleSelect = useCallback((id: number) => setSelectedId(id), []);

    const handleAddChild = useCallback((parentId: number | null) => {
        setSelectedId(null);
        const sentinelId = -Date.now();
        setDraft({
            id: sentinelId,
            parentId,
            name: { fa: "", en: "" },
            slug: { fa: "", en: "" },
            productCount: 0,
            imageUrl: null,
            description: { fa: "", en: "" },
        });
    }, []);

    const handleSave = useCallback(
        (next: AdminCategoryLike) => {
            const isNew = next.id < 0;
            if (isNew) {
                /**
                 * TODO(api): POST /admin/categories — server assigns the real id. For now we mint a
                 * positive client id so subsequent edits round-trip through `tree.upsert`.
                 */
                const realRow: AdminCategoryLike = { ...next, id: synthesizeId(tree.rows) };
                tree.upsert(realRow);
                setSelectedId(realRow.id);
                setDraft(realRow);
                return;
            }
            tree.upsert(next);
            setSelectedId(next.id);
            setDraft(next);
        },
        [tree],
    );

    const handleDelete = useCallback(
        (id: number) => {
            /** TODO(api): DELETE /admin/categories/{id} with cascade strategy negotiated by product. */
            tree.remove(id);
            if (selectedId === id) {
                setSelectedId(null);
                setDraft(null);
            }
        },
        [tree, selectedId],
    );

    const handleClose = useCallback(() => {
        setSelectedId(null);
        setDraft(null);
    }, []);

    return (
        <section className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">
                        {t("subtitleStats", {
                            total: formatNumber(stats.total, locale),
                            topLevel: formatNumber(stats.topLevel, locale),
                            products: formatNumber(stats.totalProducts, locale),
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" type="button" onClick={() => handleAddChild(null)}>
                        <FolderPlus className="size-4" aria-hidden="true" />
                        {t("addCategory")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <CategoryInspector
                        rows={tree.rows as AdminCategoryLike[]}
                        selected={selected}
                        draft={draft}
                        locale={locale}
                        onDraftChange={setDraft}
                        onCreateNew={handleAddChild}
                        onSave={handleSave}
                        onDelete={handleDelete}
                        onClose={handleClose}
                    />
                </aside>

                <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                    <Toolbar
                        search={search}
                        onSearchChange={setSearch}
                        filter={filter}
                        onFilterChange={setFilter}
                        onExpandAll={tree.expandAll}
                        onCollapseAll={tree.collapseAll}
                        stats={stats}
                        locale={locale}
                    />

                    {/**
                     * Native browser scroll so wheel + auto-scroll work during a drag. The
                     * Base UI {@link ScrollArea} swallows the wheel during dnd-kit's pointer
                     * capture, making mid-drag scrolling effectively impossible.
                     */}
                    <div className="custom-scrollbar max-h-[calc(100dvh-280px)] min-h-[420px] overflow-y-auto">
                        {filteredFlatRows.length === 0 ? (
                            <EmptyTreeState onCreate={() => handleAddChild(null)} hasSearch={search.length > 0} />
                        ) : (
                            <CategoryTree
                                flatRowsForDrag={filteredFlatRows}
                                activeId={tree.activeId}
                                activeRow={tree.activeRow}
                                projection={tree.projection}
                                activeProjectedDepth={tree.activeProjectedDepth}
                                selectedId={selectedId}
                                locale={locale}
                                onSelect={handleSelect}
                                onToggleExpand={tree.toggleExpand}
                                onAddChild={handleAddChild}
                                onDelete={handleDelete}
                                onDragStart={tree.onDragStart}
                                onDragMove={tree.onDragMove}
                                onDragEnd={tree.onDragEnd}
                                onDragCancel={tree.onDragCancel}
                            />
                        )}
                    </div>

                    <KeyboardHints />
                </div>
            </div>
        </section>
    );
}

interface ToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    filter: FilterMode;
    onFilterChange: (value: FilterMode) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    stats: TreeStats;
    locale: Locale;
}

function Toolbar({ search, onSearchChange, filter, onFilterChange, onExpandAll, onCollapseAll, stats, locale }: ToolbarProps) {
    const t = useTranslations("Categories.toolbar");
    const filters: { key: FilterMode; label: string; count?: number }[] = [
        { key: "all", label: t("filters.all"), count: stats.total },
        { key: "topLevel", label: t("filters.topLevel"), count: stats.topLevel },
        { key: "withProducts", label: t("filters.withProducts"), count: stats.withProducts },
        { key: "empty", label: t("filters.empty"), count: stats.empty },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="h-9 ps-9"
                />
                {search.length > 0 && (
                    <button
                        type="button"
                        aria-label={t("clearSearch")}
                        onClick={() => onSearchChange("")}
                        className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-3.5" aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {filters.map((entry) => {
                    const active = filter === entry.key;
                    return (
                        <button
                            key={entry.key}
                            type="button"
                            onClick={() => onFilterChange(entry.key)}
                            className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium text-xs transition-colors",
                                active
                                    ? "border-primary/40 bg-primary/10 text-primary"
                                    : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                            aria-pressed={active}
                        >
                            <span>{entry.label}</span>
                            {entry.count !== undefined && (
                                <Badge
                                    variant="secondary"
                                    className={cn(
                                        "h-4 min-w-5 justify-center bg-secondary/70 px-1 font-normal text-[10px] tabular-nums",
                                        active && "bg-primary/15 text-primary",
                                    )}
                                >
                                    {formatNumber(entry.count, locale)}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="ms-auto flex items-center gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onExpandAll}
                    aria-label={t("expandAll")}
                    title={t("expandAll")}
                    className="h-8 gap-1 px-2 text-muted-foreground"
                >
                    <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCollapseAll}
                    aria-label={t("collapseAll")}
                    title={t("collapseAll")}
                    className="h-8 gap-1 px-2 text-muted-foreground"
                >
                    <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                </Button>
            </div>
        </div>
    );
}

interface EmptyTreeStateProps {
    onCreate: () => void;
    hasSearch: boolean;
}

function EmptyTreeState({ onCreate, hasSearch }: EmptyTreeStateProps) {
    const t = useTranslations("Categories.emptyTree");
    return (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-12 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                {hasSearch ? (
                    <Search className="size-5" aria-hidden="true" />
                ) : (
                    <ListTree className="size-5" aria-hidden="true" />
                )}
            </div>
            <div className="flex flex-col gap-1">
                <h3 className="font-medium text-foreground">{hasSearch ? t("noResults.title") : t("empty.title")}</h3>
                <p className="max-w-sm text-muted-foreground text-sm">
                    {hasSearch ? t("noResults.description") : t("empty.description")}
                </p>
            </div>
            {!hasSearch && (
                <Button onClick={onCreate}>
                    <FolderPlus className="size-4" aria-hidden="true" />
                    {t("empty.cta")}
                </Button>
            )}
        </div>
    );
}

function KeyboardHints() {
    const t = useTranslations("Categories.hints");
    return (
        <div className="flex flex-wrap items-center gap-3 border-border/40 border-t pt-3 text-muted-foreground text-xs">
            <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3" aria-hidden="true" />
                {t("dragRoot")}
            </span>
            <span className="inline-flex items-center gap-1">
                <LayoutList className="size-3" aria-hidden="true" />
                {t("dragIndent")}
            </span>
        </div>
    );
}

interface TreeStats {
    total: number;
    topLevel: number;
    withProducts: number;
    empty: number;
    totalProducts: number;
}

function computeStats(rows: AdminCategory[]): TreeStats {
    let total = 0;
    let topLevel = 0;
    let withProducts = 0;
    let empty = 0;
    let totalProducts = 0;
    const childrenById = new Map<number, number>();
    for (const row of rows) {
        if (row.parentId !== null) {
            childrenById.set(row.parentId, (childrenById.get(row.parentId) ?? 0) + 1);
        }
    }
    for (const row of rows) {
        total += 1;
        totalProducts += row.productCount;
        if (row.parentId === null) topLevel += 1;
        if (row.productCount > 0) withProducts += 1;
        if (row.productCount === 0 && (childrenById.get(row.id) ?? 0) === 0) empty += 1;
    }
    return { total, topLevel, withProducts, empty, totalProducts };
}

/** Mint a client-only positive id that doesn't collide with existing rows. */
function synthesizeId(rows: AdminCategory[]): number {
    let max = 0;
    for (const row of rows) if (row.id > max) max = row.id;
    return max + 1;
}
