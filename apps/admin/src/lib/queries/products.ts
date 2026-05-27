"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminProduct } from "#/lib/adapters/products";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminProduct, Paginated, ProductStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface ProductListEnvelope {
    data: Schemas["AdminProduct"][];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

const SDK_PRODUCT_STATUS_MAP: Record<ProductStatus, "draft" | "published" | "archived" | undefined> = {
    draft: "draft",
    publish: "published",
    pending: undefined,
    private: undefined,
};

export interface ProductsListParams {
    page?: number;
    limit?: number;
    status?: ProductStatus | "any";
    search?: string;
    categoryId?: number;
}

/**
 * Paginated admin products list. Maps the view's product status vocabulary
 * (`draft`/`publish`/`pending`/`private`) into the API's narrower `draft|published|archived`
 * before issuing the request. Filters that the API doesn't support (pending/private) are dropped.
 */
export function useProductsList(params: ProductsListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sdkStatus = params.status === undefined || params.status === "any" ? undefined : SDK_PRODUCT_STATUS_MAP[params.status];
    const search = params.search;
    const categoryId = params.categoryId;
    return useQuery<ProductListEnvelope, Error, Paginated<AdminProduct>>({
        queryKey: ["admin", "products", "list", { locale, page, limit, sdkStatus, search, categoryId }],
        queryFn: () =>
            apiGet<ProductListEnvelope>("products", {
                locale,
                query: { page, limit, status: sdkStatus, search, category: categoryId },
            }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminProduct),
            meta: payload.meta ?? { page, limit, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}
