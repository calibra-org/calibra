"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiMutate } from "#/lib/queries/api-client";
import type { AdminProduct, MoneyMinor, ProductStatus, StockStatus } from "#/lib/types";

import { loadFavorites, toggleFavorite } from "./favorites";

export type CatalogVisibility = "visible" | "catalog" | "search" | "hidden";

/**
 * Optimistically toggle a product's favorite flag. The mutation is purely client-side until the
 * API ships the field — see `lib/products/favorites.ts` for the localStorage stub.
 */
export function useToggleFavorite() {
    return useMutation<Set<number>, Error, { id: number }>({
        mutationFn: async ({ id }) => toggleFavorite(id, loadFavorites()),
    });
}

export interface QuickEditPayload {
    name: string;
    slug: string;
    shortDescription: string;
    status: ProductStatus;
    regularPrice: MoneyMinor;
    salePrice: MoneyMinor | null;
    saleStartsAt?: string | null;
    saleEndsAt?: string | null;
    manageStock: boolean;
    stockQuantity: number | null;
    stockStatus: StockStatus;
    lowStockThreshold?: number | null;
    backorders?: "no" | "notify" | "yes";
    catalogVisibility?: CatalogVisibility;
    sku: string;
    gtin?: string | null;
    featured: boolean;
    categoryIds: number[];
    tagIds: number[];
    brandId: number | null;
}

/**
 * Persists a Quick Edit submission via `PATCH /admin/products/{id}`. Optimistically updates
 * the current list cache so the row reflects the new values immediately; on error we
 * invalidate to pull the server's authoritative state back.
 */
export function useQuickEditProduct() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;

    return useMutation<{ data: unknown }, Error, { id: number; payload: QuickEditPayload }>({
        mutationFn: ({ id, payload }) =>
            apiMutate<{ data: unknown }>("PATCH", `products/${id}`, {
                locale,
                body: {
                    status: payload.status,
                    sku: payload.sku.length > 0 ? payload.sku : null,
                    ...(payload.gtin !== undefined
                        ? { gtin: payload.gtin !== null && payload.gtin.length > 0 ? payload.gtin : null }
                        : {}),
                    regular_price: payload.regularPrice,
                    sale_price: payload.salePrice,
                    ...(payload.saleStartsAt !== undefined ? { sale_starts_at: payload.saleStartsAt } : {}),
                    ...(payload.saleEndsAt !== undefined ? { sale_ends_at: payload.saleEndsAt } : {}),
                    ...(payload.catalogVisibility !== undefined ? { catalog_visibility: payload.catalogVisibility } : {}),
                    featured: payload.featured,
                    category_ids: payload.categoryIds,
                    tag_ids: payload.tagIds,
                    brand_ids: payload.brandId === null ? [] : [payload.brandId],
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
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

export interface BulkUpdatePayload {
    ids: number[];
    status?: ProductStatus;
    featured?: boolean;
    catalogVisibility?: CatalogVisibility;
    stockStatus?: StockStatus;
    categoryId?: number;
    brandId?: number | null;
    /** Replace tags with the passed array; for add/remove use the dedicated tag mutation. */
    tagIds?: number[];
    priceDeltaPercent?: number;
}

/**
 * Bulk product updater. Calls `POST /admin/products/batch` with an `update` array. Only the
 * fields the API understands are sent.
 */
export function useBulkUpdateProducts() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;

    return useMutation<unknown, Error, BulkUpdatePayload>({
        mutationFn: ({ ids, status, featured, catalogVisibility, stockStatus, categoryId, brandId, tagIds }) =>
            apiMutate<unknown>("POST", "products/batch", {
                locale,
                body: {
                    update: ids.map((id) => ({
                        id,
                        ...(status !== undefined ? { status } : {}),
                        ...(featured !== undefined ? { featured } : {}),
                        ...(catalogVisibility !== undefined ? { catalog_visibility: catalogVisibility } : {}),
                        ...(stockStatus !== undefined ? { stock_status: stockStatus } : {}),
                        ...(categoryId !== undefined ? { category_ids: [categoryId] } : {}),
                        ...(brandId !== undefined ? { brand_ids: brandId === null ? [] : [brandId] } : {}),
                        ...(tagIds !== undefined ? { tag_ids: tagIds } : {}),
                    })),
                },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

/** Duplicate a single product via `POST /admin/products/{id}/duplicate`. Returns the new id. */
export function useDuplicateProduct() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { id: number }>({
        mutationFn: ({ id }) => apiMutate<{ data: { id: number } }>("POST", `products/${id}/duplicate`, { locale }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

/** Soft-delete one or more products via repeated `DELETE /admin/products/{id}`. */
export function useTrashProducts() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<unknown>("DELETE", `products/${id}`, { locale });
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

/** Restore one or more soft-deleted products. Single-id uses the single endpoint;
 *  multi-id uses the bulk endpoint in one round-trip. */
export function useRestoreProducts() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            if (ids.length === 1) {
                return apiMutate<unknown>("POST", `products/${ids[0]}/restore`, { locale });
            }
            return apiMutate<unknown>("POST", "products/restore", {
                locale,
                body: { ids },
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

/** Hard-delete one or more products. Server refuses if any selected product is referenced by
 *  an active order — the bulk response surfaces `skipped_force` ids. */
export function useForceDeleteProducts() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data?: { force_deleted?: number[]; skipped_force?: number[] } }, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            if (ids.length === 1) {
                await apiMutate<unknown>("DELETE", `products/${ids[0]}`, { locale, query: { force: 1 } });
                return { data: { force_deleted: ids } };
            }
            return apiMutate<{ data?: { force_deleted?: number[]; skipped_force?: number[] } }>("POST", "products/batch", {
                locale,
                body: {
                    delete: ids.map((id) => ({ id, force: true })),
                },
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}
