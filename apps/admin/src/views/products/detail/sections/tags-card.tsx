"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Loader2, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Input } from "#/components/ui/input";
import { useCreateTagInline } from "#/lib/products/mutations";
import { useMostUsedTags, useTagsList } from "#/lib/products/queries";
import { cn } from "#/lib/utils";
import type { CategoryTreeRow } from "#/views/products/categories/types";

import type { ProductDetailFormValues } from "../schema";

import { InlineTaxonomyCreateForm } from "./inline-taxonomy-create-form";
import { TreePickerRow } from "./tree-picker-row";

type Tab = "all" | "mostUsed";

/**
 * Sidebar Tags card. Same chrome as the Brands picker — multi-select checkbox list with
 * All / Most-used tabs, a search input, and an inline-create form at the bottom. The full
 * tags list is fetched once on mount (capped at 500) so saved tag ids always resolve to
 * their Persian name in the row without a per-id round-trip.
 */
export function TagsBody() {
    const t = useTranslations("Products.detail.tags");
    const locale = useLocale() as Locale;
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const allQuery = useTagsList();
    const mostUsedQuery = useMostUsedTags(20);
    const createInline = useCreateTagInline();

    const [tab, setTab] = useState<Tab>("all");
    const [query, setQuery] = useState("");

    const tagIds = watch("tagIds");
    const tagIdSet = useMemo(() => new Set(tagIds), [tagIds]);

    const rows = allQuery.data ?? [];

    const toggleChecked = (id: number) => {
        if (tagIdSet.has(id)) {
            setValue(
                "tagIds",
                tagIds.filter((value) => value !== id),
                { shouldDirty: true },
            );
        } else {
            setValue("tagIds", [...tagIds, id], { shouldDirty: true });
        }
    };

    const visibleRows = useMemo<CategoryTreeRow[]>(() => {
        const trimmed = query.trim().toLowerCase();
        const source = tab === "mostUsed" ? (mostUsedQuery.data ?? []) : rows;
        const filtered =
            trimmed.length === 0
                ? source
                : source.filter((row) => {
                      const haystack = `${row.name[locale] ?? ""} ${row.slug[locale] ?? ""}`.toLowerCase();
                      return haystack.includes(trimmed);
                  });
        return filtered.map((tag) => ({
            category: {
                id: tag.id,
                parentId: null,
                name: tag.name,
                slug: tag.slug,
                productCount: tag.productCount,
                imageMediaId: null,
                imageUrl: null,
            },
            depth: 0,
            parentChain: [],
            hasChildren: false,
            descendantCount: 0,
            isExpanded: false,
        }));
    }, [tab, rows, mostUsedQuery.data, query, locale]);

    const handleInlineCreate = async (name: string): Promise<{ id: number }> => {
        const result = await createInline.mutateAsync({ name });
        const newId = Number(result.data.id);
        setValue("tagIds", [...tagIds, newId], { shouldDirty: true });
        return { id: newId };
    };

    const isLoading = tab === "mostUsed" ? mostUsedQuery.isPending : allQuery.isPending;

    return (
        <div className="flex flex-col gap-3">
            <TabStrip value={tab} onChange={setTab} labels={{ all: t("tabs.all"), mostUsed: t("tabs.mostUsed") }} />

            {tab === "all" ? (
                <div className="relative">
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
                            isChecked={tagIdSet.has(row.category.id)}
                            onToggleChecked={toggleChecked}
                            productCount={row.category.productCount}
                        />
                    ))
                )}
            </div>

            <InlineTaxonomyCreateForm
                triggerLabel={t("addNew")}
                placeholder={t("addNewPlaceholder")}
                onSubmit={handleInlineCreate}
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
