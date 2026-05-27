"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ChevronsDownUp, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useCreateCategoryInline } from "#/lib/products/mutations";
import { useCategoriesTree, useMostUsedCategories } from "#/lib/products/queries";
import type { AdminCategory } from "#/lib/types";
import { cn } from "#/lib/utils";
import { flattenCategoryTree } from "#/views/products/categories/build-tree";
import { ParentPicker } from "#/views/products/categories/parent-picker";
import type { CategoryTreeRow } from "#/views/products/categories/types";

import type { ProductDetailFormValues } from "../schema";

import { InlineTaxonomyCreateForm } from "./inline-taxonomy-create-form";
import { TreePickerRow } from "./tree-picker-row";

type Tab = "all" | "mostUsed";

/**
 * Sidebar Categories card.
 *
 *   - Tabs: "All" (depth-flattened tree) / "Most used" (top-20 by `used_count`).
 *   - Search collapses non-matching siblings as the operator types; ancestors of matches stay
 *     visible so the operator sees the path.
 *   - Checking a leaf does NOT auto-check ancestors (intentional — see prompt rule 35).
 *   - Inline "+ افزودن دسته جدید" creates a category with an optional parent picker and
 *     auto-checks the new row.
 */
export function CategoriesBody() {
    const t = useTranslations("Products.detail.categories");
    const locale = useLocale() as Locale;
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const treeQuery = useCategoriesTree();
    const mostUsedQuery = useMostUsedCategories(20);
    const createInline = useCreateCategoryInline();

    const [tab, setTab] = useState<Tab>("all");
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
    const [hasInitialised, setHasInitialised] = useState(false);
    const [createParentId, setCreateParentId] = useState<number | null>(null);

    const checkedIds = watch("categoryIds");
    const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);

    const rows = treeQuery.data ?? [];

    /**
     * First time the tree lands, expand every depth-0 node so the top-level categories show
     * their immediate children. Operator-driven collapses persist after that — we never
     * overwrite the expansion state once it's been touched.
     */
    if (!hasInitialised && rows.length > 0) {
        const next = new Set<number>();
        for (const row of rows) {
            if (row.parentId === null) next.add(row.id);
        }
        setExpanded(next);
        setHasInitialised(true);
    }

    const toggleChecked = (id: number) => {
        if (checkedSet.has(id)) {
            setValue(
                "categoryIds",
                checkedIds.filter((value) => value !== id),
                { shouldDirty: true },
            );
        } else {
            setValue("categoryIds", [...checkedIds, id], { shouldDirty: true });
        }
    };

    const toggleExpand = (id: number) => {
        setExpanded((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAll = () => {
        setExpanded(() => {
            const next = new Set<number>();
            for (const row of rows) next.add(row.id);
            return next;
        });
    };

    const collapseAll = () => {
        setExpanded(new Set());
    };

    const visibleRows = useMemo<CategoryTreeRow[]>(() => {
        const trimmed = query.trim().toLowerCase();
        if (tab === "mostUsed") {
            const ranked = mostUsedQuery.data ?? [];
            return ranked.map((category) => ({
                category,
                depth: 0,
                parentChain: [],
                hasChildren: false,
                descendantCount: 0,
                isExpanded: false,
            }));
        }
        if (trimmed.length === 0) {
            return flattenCategoryTree(rows, expanded);
        }
        /**
         * Search mode: collect matches, walk up to roots so the path is shown, force every
         * ancestor expanded, then keep only matches + their ancestors in the rendered list.
         */
        const byId = new Map(rows.map((row) => [row.id, row]));
        const visibleIds = new Set<number>();
        for (const row of rows) {
            const haystack = `${row.name[locale] ?? ""} ${row.slug[locale] ?? ""}`.toLowerCase();
            if (!haystack.includes(trimmed)) continue;
            visibleIds.add(row.id);
            let cursor = row.parentId;
            while (cursor !== null) {
                visibleIds.add(cursor);
                cursor = byId.get(cursor)?.parentId ?? null;
            }
        }
        return flattenCategoryTree(rows, null).filter((row) => visibleIds.has(row.category.id));
    }, [tab, rows, expanded, query, locale, mostUsedQuery.data]);

    const handleInlineCreate = async (name: string): Promise<{ id: number }> => {
        const result = await createInline.mutateAsync({ name, parentId: createParentId });
        const newId = Number(result.data.id);
        setValue("categoryIds", [...checkedIds, newId], { shouldDirty: true });
        setCreateParentId(null);
        return { id: newId };
    };

    const isLoading = tab === "mostUsed" ? mostUsedQuery.isPending : treeQuery.isPending;

    return (
        <div className="flex flex-col gap-3">
            <TabStrip value={tab} onChange={setTab} labels={{ all: t("tabs.all"), mostUsed: t("tabs.mostUsed") }} />

            {tab === "all" ? (
                <div className="flex items-center gap-1">
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t("searchPlaceholder")}
                            className="h-8 ps-7"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={expandAll}
                        aria-label={t("expandAll")}
                        title={t("expandAll")}
                        className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
                    >
                        <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={collapseAll}
                        aria-label={t("collapseAll")}
                        title={t("collapseAll")}
                        className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
                    >
                        <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                    </Button>
                </div>
            ) : null}

            <div role="tree" aria-label={t("treeLabel")} className="flex max-h-72 flex-col gap-0.5 overflow-y-auto pe-1">
                {isLoading ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    </div>
                ) : visibleRows.length === 0 ? (
                    <p className="px-2 py-3 text-center text-muted-foreground text-xs">
                        {query.trim().length > 0 ? t("noMatches") : t("empty")}
                    </p>
                ) : (
                    visibleRows.map((row) => (
                        <TreePickerRow
                            key={row.category.id}
                            row={row}
                            locale={locale}
                            selection="multi"
                            isChecked={checkedSet.has(row.category.id)}
                            onToggleChecked={toggleChecked}
                            onToggleExpand={tab === "all" && query.trim().length === 0 ? toggleExpand : undefined}
                            productCount={row.category.productCount}
                        />
                    ))
                )}
            </div>

            <InlineTaxonomyCreateForm
                triggerLabel={t("addNew")}
                placeholder={t("addNewPlaceholder")}
                onSubmit={handleInlineCreate}
                secondary={
                    <CreateParentPickerSlot
                        rows={rows}
                        value={createParentId}
                        onChange={setCreateParentId}
                        label={t("addNewParent")}
                    />
                }
                successToast={t("createdToast")}
                errorToast={t("createFailedToast")}
            />
        </div>
    );
}

interface TabStripProps {
    value: Tab;
    onChange: (next: Tab) => void;
    labels: { all: string; mostUsed: string };
}

function TabStrip({ value, onChange, labels }: TabStripProps) {
    return (
        <div className="inline-flex w-full items-center rounded-md border border-border/60 bg-muted/40 p-0.5" role="tablist">
            <TabButton active={value === "all"} onClick={() => onChange("all")}>
                {labels.all}
            </TabButton>
            <TabButton active={value === "mostUsed"} onClick={() => onChange("mostUsed")}>
                {labels.mostUsed}
            </TabButton>
        </div>
    );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 flex-1 items-center justify-center rounded px-2 font-medium text-xs transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

interface CreateParentPickerSlotProps {
    rows: AdminCategory[];
    value: number | null;
    onChange: (next: number | null) => void;
    label: string;
}

function CreateParentPickerSlot({ rows, value, onChange, label }: CreateParentPickerSlotProps) {
    const locale = useLocale() as Locale;
    return (
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{label}</span>
            <ParentPicker
                rows={rows}
                excludeId={null}
                excludeDescendants={EMPTY_DESCENDANTS}
                value={value}
                onChange={onChange}
                locale={locale}
            />
        </div>
    );
}

const EMPTY_DESCENDANTS: ReadonlySet<number> = new Set();
