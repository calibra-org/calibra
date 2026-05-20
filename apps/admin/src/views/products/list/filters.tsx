"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { FacetedFilterDef, ToggleFilterDef } from "#/components/data-table";
import { useProductFacets } from "#/lib/products/queries";
import type { ProductType, StockStatus } from "#/lib/types";

const PRODUCT_TYPES: ProductType[] = ["simple", "variable", "grouped", "external"];
const STOCK_STATUSES: StockStatus[] = ["instock", "outofstock", "onbackorder"];

/**
 * Builds the toolbar's faceted-filter array. Categories / brands / tags come from a single facets
 * query (`/categories`, `/brands`, `/tags`); type and stock-status come from the schema enums so
 * the popover renders even when the catalog is empty.
 *
 * The function intentionally returns a fresh array on every render — toolbar receives stable
 * `paramKey` strings so React Query's key comparison stays correct.
 */
export function useProductFilters(): { facets: FacetedFilterDef[]; toggles: ToggleFilterDef[]; isLoading: boolean } {
    const t = useTranslations("Products.list.filters");
    const productTypeT = useTranslations("Products.list.type");
    const stockT = useTranslations("StockStatus");
    const _locale = useLocale() as Locale;
    const { data, isPending } = useProductFacets();

    const facets = useMemo<FacetedFilterDef[]>(
        () => [
            {
                paramKey: "type",
                label: t("type"),
                multiple: false,
                options: PRODUCT_TYPES.map((value) => ({ value, label: productTypeT(value) })),
            },
            {
                paramKey: "stock",
                label: t("stock"),
                multiple: false,
                options: STOCK_STATUSES.map((value) => ({ value, label: stockT(value) })),
            },
            {
                paramKey: "category",
                label: t("category"),
                multiple: true,
                options: data?.categories.map((row) => ({ value: row.value, label: row.label, count: row.count })) ?? [],
            },
            {
                paramKey: "brand",
                label: t("brand"),
                multiple: true,
                options: data?.brands.map((row) => ({ value: row.value, label: row.label, count: row.count })) ?? [],
            },
            {
                paramKey: "tag",
                label: t("tag"),
                multiple: true,
                options: data?.tags.map((row) => ({ value: row.value, label: row.label, count: row.count })) ?? [],
            },
        ],
        [data, productTypeT, stockT, t],
    );

    const toggles = useMemo<ToggleFilterDef[]>(
        () => [
            {
                paramKey: "fav",
                label: t("favorites"),
                icon: <Star className="size-3.5" aria-hidden="true" />,
            },
        ],
        [t],
    );

    return { facets, toggles, isLoading: isPending };
}
