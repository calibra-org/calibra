"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiMutate } from "#/lib/queries/api-client";
import type { AdminProduct, MoneyMinor, ProductStatus, StockStatus } from "#/lib/types";

import { loadFavorites, toggleFavorite } from "./favorites";

type SdkProductStatus = "draft" | "published" | "archived";

const SDK_PRODUCT_STATUS_MAP: Record<ProductStatus, SdkProductStatus | undefined> = {
    draft: "draft",
    publish: "published",
    pending: undefined,
    private: undefined,
};

/**
 * Optimistically toggle a product's favorite flag. The mutation is purely client-side until the
 * API ships the field — see `lib/products/favorites.ts` for the localStorage stub. Consumers
 * receive the resulting set so they can re-render without reading back from storage.
 */
export function useToggleFavorite() {
    return useMutation<Set<number>, Error, { id: number }>({
        mutationFn: async ({ id }) => {
            /** Real round-trip lives here once the endpoint is wired. */
            return toggleFavorite(id, loadFavorites());
        },
    });
}

export interface QuickEditPayload {
    name: string;
    slug: string;
    shortDescription: string;
    status: ProductStatus;
    regularPrice: MoneyMinor;
    salePrice: MoneyMinor | null;
    manageStock: boolean;
    stockQuantity: number | null;
    stockStatus: StockStatus;
    sku: string;
    featured: boolean;
    categoryIds: number[];
    tagIds: number[];
    brandId: number | null;
}

/**
 * Persists a Quick Edit submission via `PATCH /admin/products/{id}`. Optimistically updates the
 * current list cache so the row reflects the new values immediately; on error we invalidate to
 * pull the server's authoritative state back.
 */
export function useQuickEditProduct() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;

    return useMutation<{ data: unknown }, Error, { id: number; payload: QuickEditPayload }>({
        mutationFn: ({ id, payload }) =>
            apiMutate<{ data: unknown }>("PATCH", `products/${id}`, {
                locale,
                body: {
                    status: SDK_PRODUCT_STATUS_MAP[payload.status] ?? "draft",
                    sku: payload.sku.length > 0 ? payload.sku : null,
                    regular_price: payload.regularPrice,
                    sale_price: payload.salePrice,
                    featured: payload.featured,
                    category_ids: payload.categoryIds,
                    tag_ids: payload.tagIds,
                    brand_id: payload.brandId,
                    translations: [
                        {
                            locale,
                            name: payload.name,
                            slug: payload.slug,
                            short_description: payload.shortDescription,
                        },
                    ],
                },
            }),
        onMutate: async ({ id, payload }) => {
            await queryClient.cancelQueries({ queryKey: ["admin", "products", "list"] });
            const previous = queryClient.getQueriesData<{ data: AdminProduct[] }>({ queryKey: ["admin", "products", "list"] });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<{ data: AdminProduct[]; meta: unknown } | undefined>(key, (existing) => {
                    if (existing === undefined) return existing;
                    return {
                        ...existing,
                        data: existing.data.map((row) =>
                            row.id === id
                                ? {
                                      ...row,
                                      sku: payload.sku,
                                      status: payload.status,
                                      name: { fa: payload.name, en: payload.name },
                                      slug: { fa: payload.slug, en: payload.slug },
                                      shortDescription: { fa: payload.shortDescription, en: payload.shortDescription },
                                      regularPrice: payload.regularPrice,
                                      salePrice: payload.salePrice,
                                      manageStock: payload.manageStock,
                                      stockQuantity: payload.stockQuantity,
                                      stockStatus: payload.stockStatus,
                                      featured: payload.featured,
                                      categoryIds: payload.categoryIds,
                                      tagIds: payload.tagIds,
                                      brandId: payload.brandId,
                                  }
                                : row,
                        ),
                    };
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            const previous = (context as { previous?: [unknown, unknown][] } | undefined)?.previous;
            if (previous === undefined) return;
            for (const [key, snapshot] of previous) {
                queryClient.setQueryData(key as readonly unknown[], snapshot);
            }
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
        },
    });
}

export interface BulkUpdatePayload {
    ids: number[];
    status?: ProductStatus;
    priceDeltaPercent?: number;
    categoryId?: number;
}

/**
 * Bulk product updater. Calls `POST /admin/products/batch` with an `update` array. Only the
 * fields the API understands are sent — category mutations need a list of `category_ids` per
 * row, which the caller resolves before invoking.
 */
export function useBulkUpdateProducts() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;

    return useMutation<unknown, Error, BulkUpdatePayload>({
        mutationFn: ({ ids, status, categoryId }) =>
            apiMutate<unknown>("POST", "products/batch", {
                locale,
                body: {
                    update: ids.map((id) => ({
                        id,
                        ...(status !== undefined ? { status: SDK_PRODUCT_STATUS_MAP[status] ?? "draft" } : {}),
                        ...(categoryId !== undefined ? { category_ids: [categoryId] } : {}),
                    })),
                },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
        },
    });
}

/** Duplicate a single product via `POST /admin/products/{id}/duplicate`. */
export function useDuplicateProduct() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { id: number }>({
        mutationFn: ({ id }) => apiMutate<unknown>("POST", `products/${id}/duplicate`, { locale }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
        },
    });
}

/** Soft-delete one or more products via repeated `DELETE /admin/products/{id}`. */
export function useTrashProducts() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            /** Sequential to keep the upstream's per-request cost tracking honest. */
            for (const id of ids) {
                await apiMutate<unknown>("DELETE", `products/${id}`, { locale });
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
        },
    });
}
