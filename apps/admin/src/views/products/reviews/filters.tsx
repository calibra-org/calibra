"use client";

import { BadgeCheck, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { FacetedFilterDef, ToggleFilterDef } from "#/components/data-table";
import { useReviewFacets } from "#/lib/reviews/queries";

/**
 * Builds the toolbar's facet array. Ratings are pulled from the enum so the popover always
 * renders; products come from the product lookup query (used by columns too). Verified-purchase
 * is exposed as a toggle so it sits beside the search input in the toolbar.
 */
export function useReviewFiltersConfig(): {
    facets: FacetedFilterDef[];
    toggles: ToggleFilterDef[];
    isLoading: boolean;
} {
    const t = useTranslations("Reviews.list.filters");
    const { ratings, products, isLoading } = useReviewFacets();

    const facets = useMemo<FacetedFilterDef[]>(
        () => [
            {
                paramKey: "rating",
                label: t("rating"),
                multiple: false,
                options: ratings.map((row) => ({
                    value: row.value,
                    label: (
                        <span className="inline-flex items-center gap-0.5 text-warning">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <Star
                                    // biome-ignore lint/suspicious/noArrayIndexKey: rating stars rendered in fixed order
                                    key={index}
                                    className={
                                        index < Number(row.value) ? "size-3 fill-current" : "size-3 stroke-current opacity-25"
                                    }
                                    aria-hidden="true"
                                />
                            ))}
                        </span>
                    ),
                })),
            },
            {
                paramKey: "product",
                label: t("product"),
                multiple: false,
                options: products.map((row) => ({ value: row.value, label: row.label })),
            },
        ],
        [products, ratings, t],
    );

    const toggles = useMemo<ToggleFilterDef[]>(
        () => [
            {
                paramKey: "verified",
                label: t("verified"),
                icon: <BadgeCheck className="size-3.5 text-success" aria-hidden="true" />,
            },
        ],
        [t],
    );

    return { facets, toggles, isLoading };
}
