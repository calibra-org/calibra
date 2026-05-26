"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Loader2, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useCreateBrandInline } from "#/lib/products/mutations";
import { useBrandsList, useMostUsedBrands } from "#/lib/products/queries";
import { cn } from "#/lib/utils";
import type { CategoryTreeRow } from "#/views/products/categories/types";

import type { ProductDetailFormValues } from "../schema";

import { InlineTaxonomyCreateForm } from "./inline-taxonomy-create-form";
import { TreePickerRow } from "./tree-picker-row";

type Tab = "all" | "mostUsed";

/**
 * Sidebar Brands card. Same chrome as Categories (tabs + search + inline-create) but the
 * selection is **single** (`brandId: number | null`). Brands have no hierarchy in the schema —
 * every row renders at depth 0. A "حذف انتخاب" link clears the selection.
 */
export function BrandsBody() {
    const t = useTranslations("Products.detail.brands");
    const locale = useLocale() as Locale;
    const radioGroupName = useId();
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const allQuery = useBrandsList();
    const mostUsedQuery = useMostUsedBrands(20);
    const createInline = useCreateBrandInline();

    const [tab, setTab] = useState<Tab>("all");
    const [query, setQuery] = useState("");

    const selectedId = watch("brandId");

    const rows = allQuery.data ?? [];

    const toggleSelected = (id: number) => {
        setValue("brandId", id === selectedId ? null : id, { shouldDirty: true });
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
        return filtered.map((brand) => ({
            category: {
                id: brand.id,
                parentId: null,
                name: brand.name,
                slug: brand.slug,
                productCount: brand.productCount,
                imageMediaId: brand.imageMediaId,
                imageUrl: brand.logoUrl,
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
        setValue("brandId", newId, { shouldDirty: true });
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
                            selection="single"
                            selectionGroupName={radioGroupName}
                            isChecked={selectedId === row.category.id}
                            onToggleChecked={toggleSelected}
                            productCount={row.category.productCount}
                        />
                    ))
                )}
            </div>

            {selectedId !== null ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-fit gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setValue("brandId", null, { shouldDirty: true })}
                >
                    <X className="size-3" aria-hidden="true" />
                    {t("clearSelection")}
                </Button>
            ) : null}

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
