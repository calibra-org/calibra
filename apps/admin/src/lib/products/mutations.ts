"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiMutate } from "#/lib/queries/api-client";
import type { AdminProduct, MoneyMinor, ProductStatus, StockStatus } from "#/lib/types";

export type CatalogVisibility = "visible" | "catalog" | "search" | "hidden";

/**
 * Star / unstar a product for the current admin via the server-backed per-user favourites
 * endpoint (`PUT`/`DELETE /products/:id/favorite`). The caller passes the desired next state; the
 * star UI updates optimistically and reverts on error. Invalidates the list so the `favorites=1`
 * filter and the `is_favorite` flags refetch.
 */
export function useToggleFavorite() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<void, Error, { id: number; favorite: boolean }>({
        mutationFn: async ({ id, favorite }) => {
            await apiMutate<void>(favorite ? "PUT" : "DELETE", `products/${id}/favorite`, { locale });
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
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
        onMutate: async ({ ids, status, featured, catalogVisibility, stockStatus }) => {
            /**
             * Optimistic patch so cell-level toggles (visibility / featured / status) feel
             * instant. Save the per-key snapshot so `onError` can roll back exactly the rows
             * we touched without clobbering other concurrent invalidations.
             */
            await queryClient.cancelQueries({ queryKey: ["admin", "products", "list"] });
            const previous = queryClient.getQueriesData<{ data: AdminProduct[] }>({
                queryKey: ["admin", "products", "list"],
            });
            const idSet = new Set(ids);
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<{ data: AdminProduct[]; meta: unknown } | undefined>(key, (existing) => {
                    if (existing === undefined) return existing;
                    return {
                        ...existing,
                        data: existing.data.map((row) =>
                            idSet.has(row.id)
                                ? {
                                      ...row,
                                      ...(status !== undefined ? { status } : {}),
                                      ...(featured !== undefined ? { featured } : {}),
                                      ...(catalogVisibility !== undefined ? { catalogVisibility } : {}),
                                      ...(stockStatus !== undefined ? { stockStatus } : {}),
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

/**
 * Persists a full product-detail submission via `PATCH /admin/products/{id}`. Accepts the
 * already-built wire-shape payload (the form layer maps Toman→Rial, ISO dates, etc.). When
 * `ifMatch` is supplied, the proxy forwards it as the `If-Match` header so the api can reject
 * stale writes with a 409.
 */
export function useUpdateProduct(id: number) {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: unknown }, Error, { body: Record<string, unknown>; ifMatch?: string }>({
        mutationFn: ({ body, ifMatch }) =>
            apiMutate<{ data: unknown }>("PATCH", `products/${id}`, {
                locale,
                body,
                ifMatch,
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "product", id] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

/** Creates a new product via `POST /admin/products`. Returns the newly minted id for routing. */
export function useCreateProduct() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { body: Record<string, unknown> }>({
        mutationFn: ({ body }) => apiMutate<{ data: { id: number } }>("POST", "products", { locale, body }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-counts"] });
        },
    });
}

/** Variations CRUD — single-row endpoints + batch. All cache invalidations key off the parent product. */
export function useCreateVariation(productId: number) {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { body: Record<string, unknown> }>({
        mutationFn: ({ body }) =>
            apiMutate<{ data: { id: number } }>("POST", `products/${productId}/variations`, { locale, body }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "product", productId] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-variations", productId] });
        },
    });
}

export function useUpdateVariation(productId: number) {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: unknown }, Error, { variationId: number; body: Record<string, unknown> }>({
        mutationFn: ({ variationId, body }) =>
            apiMutate<{ data: unknown }>("PATCH", `products/${productId}/variations/${variationId}`, { locale, body }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "product", productId] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-variations", productId] });
        },
    });
}

export function useDeleteVariation(productId: number) {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { variationId: number }>({
        mutationFn: ({ variationId }) =>
            apiMutate<unknown>("DELETE", `products/${productId}/variations/${variationId}`, { locale }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "product", productId] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-variations", productId] });
        },
    });
}

/**
 * Atomic `{create, update, delete}` batch over a variable product's variations. Powers the
 * cartesian "Generate from all attributes" flow and the grid's bulk-action menu.
 */
export function useBatchVariations(productId: number) {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        { data: { created: number[]; updated: number[]; deleted: number[] } },
        Error,
        {
            create?: Record<string, unknown>[];
            update?: (Record<string, unknown> & { id: number })[];
            delete?: number[];
        }
    >({
        mutationFn: (body) =>
            apiMutate<{ data: { created: number[]; updated: number[]; deleted: number[] } }>(
                "POST",
                `products/${productId}/variations/batch`,
                { locale, body },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "product", productId] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "product-variations", productId] });
        },
    });
}

/**
 * Inline term creation — the chip bar on an attribute-link row lets operators type a new term
 * and press Enter. Attribute creation itself stays on the global /products/attributes page so
 * there's only one place that owns the taxonomy.
 */
export function useCreateAttributeTerm(attributeId: number) {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { name: string }>({
        mutationFn: ({ name }) =>
            apiMutate<{ data: { id: number } }>("POST", `attributes/${attributeId}/terms`, {
                locale,
                body: {
                    slug: slugify(name),
                    translations: [{ locale: "fa", name }],
                },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "attributes", attributeId, "terms"] });
        },
    });
}

/** Compact slugifier — strips diacritics-free Persian/English to a lowercase a-z-0-9-dash. */
function slugify(input: string): string {
    return (
        input
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9آ-ی-]/gi, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || `attr-${Date.now()}`
    );
}

/* -------------------------------------------------------------------------- */
/*  Inline taxonomy create — sidebar pickers on the product-detail form       */
/* -------------------------------------------------------------------------- */

/**
 * Posts the minimal `{translations: [{locale, name}]}` payload accepted by `POST /admin/categories`.
 * The api auto-derives the slug via `slugify(name, "fa")`. Optional `parentId` lets the inline
 * form drop a child under an existing branch in one round-trip. Invalidates the picker query so
 * the new row shows up immediately and can be auto-checked by the card.
 */
export function useCreateCategoryInline() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { name: string; parentId?: number | null }>({
        mutationFn: ({ name, parentId }) =>
            apiMutate<{ data: { id: number } }>("POST", "categories", {
                locale,
                body: {
                    ...(parentId !== undefined && parentId !== null ? { parent_id: parentId } : {}),
                    translations: [{ locale: "fa", name }],
                },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "categories", "picker"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "categories", "list"] });
        },
    });
}

/** Inline-create a tag. Returns `{ id }` for the chip strip to adopt as the new selection. */
export function useCreateTagInline() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { name: string }>({
        mutationFn: ({ name }) =>
            apiMutate<{ data: { id: number } }>("POST", "tags", {
                locale,
                body: { translations: [{ locale: "fa", name }] },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "tags"] });
        },
    });
}

/** Inline-create a brand. */
export function useCreateBrandInline() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<{ data: { id: number } }, Error, { name: string }>({
        mutationFn: ({ name }) =>
            apiMutate<{ data: { id: number } }>("POST", "brands", {
                locale,
                body: { translations: [{ locale: "fa", name }] },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "brands", "picker"] });
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
