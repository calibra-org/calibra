"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ImagePlus, Sparkles, Star, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { FacetedFilterDef, ToggleFilterDef } from "#/components/data-table";
import { useProductFacets } from "#/lib/products/queries";
import type { ProductType, StockStatus } from "#/lib/types";

const PRODUCT_TYPES: ProductType[] = ["simple", "variable", "grouped", "external"];
const STOCK_STATUSES: StockStatus[] = ["instock", "outofstock", "onbackorder"];
const STOCK_LEVELS = ["instock", "low", "outofstock"] as const;
const CATALOG_VISIBILITIES = ["visible", "catalog", "search", "hidden"] as const;

/**
 * Builds the toolbar's faceted + toggle filter arrays. Categories / brands / tags come from
 * the global facets query; the remaining facets are static enums.
 */
export function useProductFilters(): { facets: FacetedFilterDef[]; toggles: ToggleFilterDef[]; isLoading: boolean } {
    const t = useTranslations("Products.list.filters");
    const productTypeT = useTranslations("Products.list.type");
    const stockT = useTranslations("StockStatus");
    const stockLevelT = useTranslations("Products.list.filters.stockLevel");
    const visibilityT = useTranslations("Products.list.filters.visibilityOption");
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
                paramKey: "stockLevel",
                label: t("stockLevelLabel"),
                multiple: false,
                options: STOCK_LEVELS.map((value) => ({ value, label: stockLevelT(value) })),
            },
            {
                paramKey: "visibility",
                label: t("visibility"),
                multiple: false,
                options: CATALOG_VISIBILITIES.map((value) => ({ value, label: visibilityT(value) })),
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
        [data, productTypeT, stockT, stockLevelT, visibilityT, t],
    );

    const toggles = useMemo<ToggleFilterDef[]>(
        () => [
            {
                paramKey: "fav",
                label: t("favorites"),
                icon: <Star className="size-3.5" aria-hidden="true" />,
            },
            {
                paramKey: "onSale",
                label: t("onSale"),
                icon: <Tag className="size-3.5" aria-hidden="true" />,
            },
            {
                paramKey: "featured",
                label: t("featured"),
                icon: <Sparkles className="size-3.5" aria-hidden="true" />,
            },
            {
                paramKey: "hasImage",
                label: t("hasImage"),
                icon: <ImagePlus className="size-3.5" aria-hidden="true" />,
            },
        ],
        [t],
    );

    return { facets, toggles, isLoading: isPending };
}
