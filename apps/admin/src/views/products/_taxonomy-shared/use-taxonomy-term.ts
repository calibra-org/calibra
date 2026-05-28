"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { TaxonomyKind } from "#/lib/types";

type SdkAdminTaxonomy = AdminSchemas["schemas"]["AdminTaxonomy"];

interface TaxonomyResourceEnvelope {
    data: SdkAdminTaxonomy;
}

/** Brand/category/tag all serialize to the shared `AdminTaxonomy` show shape under these routes. */
const PROXY_PATH: Record<TaxonomyKind, string> = {
    category: "categories",
    tag: "tags",
    brand: "brands",
};

/**
 * Fetches a single taxonomy term (brand/category/tag) via its admin `show` endpoint so the
 * detail sheet can seed an editable draft with the fields the list row omits — `description`
 * (via the active-locale translation), the linked image, and `used_count`. Disabled until a
 * term is actually targeted, so mounting the sheet host costs nothing.
 */
export function useTaxonomyTerm(kind: TaxonomyKind | null, id: number | null): UseQueryResult<SdkAdminTaxonomy, Error> {
    const locale = useLocale() as Locale;
    return useQuery<TaxonomyResourceEnvelope, Error, SdkAdminTaxonomy>({
        queryKey: ["admin", "taxonomy-term", kind, id, locale],
        enabled: kind !== null && id !== null,
        queryFn: () => apiGet<TaxonomyResourceEnvelope>(`${PROXY_PATH[kind as TaxonomyKind]}/${id}`, { locale }),
        select: (payload) => payload.data,
        staleTime: 30_000,
    });
}
