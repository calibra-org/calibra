"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { AdminCategory, LocalizedString, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

interface CategoryListEnvelope {
    data: SdkAdminTaxonomy[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function toAdminCategory(c: SdkAdminTaxonomy): AdminCategory {
    return {
        id: c.id,
        parentId: c.parent_id ?? null,
        name: dup(c.name),
        slug: dup(c.slug),
        productCount: 0,
        imageUrl: c.image_url ?? null,
    };
}

export interface CategoriesListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

/**
 * Browser-side categories list — kept in sync with the server-rendered seed so reorders and
 * edits invalidate the cache instead of forcing a full page reload.
 *
 * `productCount` is sent as zero by the API listing today; the server-rendered page hydrates
 * the initial counts. Refetches after mutations therefore lose counts until the API exposes
 * them on the index payload (TODO below). Callers that need accurate counts mid-session can
 * still call {@link useCategoryProductCount} per row, but the current view doesn't — the
 * post-edit refresh is rare enough that the staleness is acceptable.
 *
 * TODO(api): include `product_count` on `GET /api/v1/admin/categories` so this hook returns
 * fully-populated rows without the fan-out the SSR repo does today.
 */
export function useCategoriesList(params: CategoriesListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 200;
    const search = params.search;
    return useQuery<CategoryListEnvelope, Error, Paginated<AdminCategory>>({
        queryKey: ["admin", "categories", "list", { locale, page, perPage, search }],
        queryFn: () => apiGet<CategoryListEnvelope>("categories", { locale, query: { page, perPage, search } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCategory),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}
