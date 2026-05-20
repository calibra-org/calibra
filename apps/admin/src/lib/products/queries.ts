"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminProduct } from "#/lib/adapters/products";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminBrand, AdminCategory, AdminProduct, AdminTag, ProductStatus, ProductType, StockStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface ProductListEnvelope {
    data: Schemas["AdminProduct"][];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

interface TaxonomyEnvelope {
    data: { id: number; name: string; slug: string; image_url?: string | null }[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

/** Status values the SDK accepts. The view's vocabulary is wider — see `SDK_PRODUCT_STATUS_MAP`. */
type SdkProductStatus = "draft" | "published" | "archived";

const SDK_PRODUCT_STATUS_MAP: Record<ProductStatus, SdkProductStatus | undefined> = {
    draft: "draft",
    publish: "published",
    pending: undefined,
    private: undefined,
};

const SDK_STOCK_STATUS_MAP: Record<StockStatus, "in_stock" | "out_of_stock" | "on_backorder"> = {
    instock: "in_stock",
    outofstock: "out_of_stock",
    onbackorder: "on_backorder",
};

export interface ProductsListParams {
    page?: number;
    perPage?: number;
    sort?: string;
    status?: ProductStatus | "any";
    type?: ProductType;
    stockStatus?: StockStatus;
    categoryId?: number;
    brandId?: number;
    tagId?: number;
    onSale?: boolean;
    favoriteIds?: number[];
    search?: string;
}

/**
 * Paginated admin products list. Mirrors the WooCommerce-shaped list UX:
 *  - status filter (mapped onto the API's narrower `draft|published|archived`)
 *  - product type / stock status / category / brand / tag / on-sale facets
 *  - free-text search
 *  - favorites: applied client-side after the server response because the API doesn't yet flag
 *    favorited rows. Passing `favoriteIds` triggers a post-filter through the active set.
 *
 * `placeholderData: keepPreviousData` keeps the previous page on screen while the next one is
 * fetched, so paginating doesn't snap the table to a skeleton.
 */
export function useProductsList(params: ProductsListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const sdkStatus = params.status === undefined || params.status === "any" ? undefined : SDK_PRODUCT_STATUS_MAP[params.status];
    const sdkStockStatus = params.stockStatus !== undefined ? SDK_STOCK_STATUS_MAP[params.stockStatus] : undefined;

    return useQuery({
        queryKey: [
            "admin",
            "products",
            "list",
            {
                locale,
                page,
                perPage,
                sort: params.sort ?? "",
                sdkStatus,
                type: params.type,
                sdkStockStatus,
                categoryId: params.categoryId,
                brandId: params.brandId,
                tagId: params.tagId,
                onSale: params.onSale === true ? true : undefined,
                search: params.search,
                favoriteIds: params.favoriteIds,
            },
        ],
        queryFn: () =>
            apiGet<ProductListEnvelope>("products", {
                locale,
                query: {
                    page,
                    perPage,
                    sort: params.sort,
                    status: sdkStatus,
                    type: params.type,
                    stock_status: sdkStockStatus,
                    category: params.categoryId,
                    brand: params.brandId,
                    tag: params.tagId,
                    on_sale: params.onSale === true ? true : undefined,
                    search: params.search,
                },
            }),
        placeholderData: keepPreviousData,
        select: (payload): { data: AdminProduct[]; meta: { page: number; perPage: number; total: number; lastPage: number } } => {
            const data = (payload.data ?? []).map(toAdminProduct);
            const filtered =
                params.favoriteIds !== undefined && params.favoriteIds.length > 0
                    ? data.filter((row) => params.favoriteIds?.includes(row.id) === true)
                    : data;
            const meta = payload.meta ?? { page, perPage, total: filtered.length, lastPage: 1 };
            return { data: filtered, meta };
        },
    });
}

interface AdminProductFacetEntry<T extends string | number = string> {
    value: T;
    label: string;
    count?: number;
}

/**
 * Lightweight facets query. Pulls all categories/brands/tags via their list endpoints (one shot,
 * `perPage=100`) and feeds them into the toolbar's faceted-filter options. Counts are returned
 * by the taxonomy endpoints' meta when present; otherwise we omit them so the popover doesn't
 * show stale `0`s.
 */
export function useProductFacets() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "product-facets", { locale }],
        queryFn: async () => {
            const [cats, brands, tags] = await Promise.all([
                apiGet<TaxonomyEnvelope>("categories", { locale, query: { perPage: 100 } }).catch(
                    () => ({ data: [] }) as TaxonomyEnvelope,
                ),
                apiGet<TaxonomyEnvelope>("brands", { locale, query: { perPage: 100 } }).catch(
                    () => ({ data: [] }) as TaxonomyEnvelope,
                ),
                apiGet<TaxonomyEnvelope>("tags", { locale, query: { perPage: 100 } }).catch(
                    () => ({ data: [] }) as TaxonomyEnvelope,
                ),
            ]);
            return {
                categories: cats.data.map((row) => ({
                    value: String(row.id),
                    label: row.name,
                    count: undefined as number | undefined,
                })),
                brands: brands.data.map((row) => ({
                    value: String(row.id),
                    label: row.name,
                    count: undefined as number | undefined,
                })),
                tags: tags.data.map((row) => ({
                    value: String(row.id),
                    label: row.name,
                    count: undefined as number | undefined,
                })),
            };
        },
        staleTime: 5 * 60 * 1000,
    });
}

export type ProductFacetOption<T extends string | number = string> = AdminProductFacetEntry<T>;

export type { AdminBrand, AdminCategory, AdminTag };

/**
 * Per-status row counts powering the WP-style status tabs. Fans out one `?perPage=1` request per
 * status the page knows about — each lands on the same cached query key so flipping tabs reuses
 * the count without a refetch. `any` is the unfiltered total. Statuses the API can't actually
 * distinguish (`pending` / `private`) return `undefined`, so the UI knows to omit the badge
 * entirely instead of misleading operators with a phantom `0`.
 */
export function useProductCountsByStatus() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "product-counts", { locale }],
        queryFn: async (): Promise<Partial<Record<"any" | ProductStatus, number>>> => {
            const fetchTotal = async (status?: SdkProductStatus): Promise<number | undefined> => {
                try {
                    const payload = await apiGet<ProductListEnvelope>("products", {
                        locale,
                        query: { perPage: 1, status },
                    });
                    return payload.meta?.total ?? payload.data?.length ?? 0;
                } catch {
                    return undefined;
                }
            };
            const [any, draft, publish] = await Promise.all([
                fetchTotal(undefined),
                fetchTotal("draft"),
                fetchTotal("published"),
            ]);
            return { any, draft, publish };
        },
        staleTime: 30 * 1000,
    });
}
