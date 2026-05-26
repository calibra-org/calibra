"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminProduct } from "#/lib/adapters/products";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminBrand, AdminCategory, AdminProduct, AdminTag, ProductStatus, ProductType, StockStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

export type StockLevel = "instock" | "low" | "outofstock";
export type CatalogVisibility = "visible" | "catalog" | "search" | "hidden";

export interface ProductListMeta {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
}

interface ProductListEnvelope {
    data: Schemas["AdminProduct"][];
    meta?: ProductListMeta;
    facets?: Record<string, Record<string, number>>;
}

interface TaxonomyEnvelope {
    data: { id: number; name: string; slug: string; image_url?: string | null }[];
    meta?: ProductListMeta;
}

export interface ProductsListParams {
    page?: number;
    perPage?: number;
    sort?: string;
    status?: ProductStatus | "any";
    type?: ProductType;
    stockStatus?: StockStatus;
    stockLevel?: StockLevel;
    catalogVisibility?: CatalogVisibility;
    categoryId?: number;
    brandId?: number;
    tagId?: number;
    onSale?: boolean;
    featured?: boolean;
    hasImage?: boolean;
    withTrashed?: boolean;
    onlyTrashed?: boolean;
    createdFrom?: string;
    createdTo?: string;
    ids?: number[];
    favoriteIds?: number[];
    search?: string;
    includeFacetCounts?: boolean;
}

export interface ProductsListResult {
    data: AdminProduct[];
    meta: ProductListMeta;
    facets?: Record<string, Record<string, number>>;
}

/**
 * Paginated admin products list. Speaks the same status vocabulary as the API
 * (`draft | publish | pending | private`) end-to-end now — the lossy mapping that dropped
 * `pending` and `private` to `undefined` lived here until {@link https://github.com/calibra-org/calibra/pull/41 #41}.
 *
 * Trash semantics: `onlyTrashed` is mutually-exclusive with `withTrashed`; passing `onlyTrashed`
 * narrows the list to soft-deleted rows. Passing neither hides them.
 */
export function useProductsList(
    params: ProductsListParams = {},
): ReturnType<typeof useQuery<ProductListEnvelope, Error, ProductsListResult>> {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const status = params.status === undefined || params.status === "any" ? undefined : params.status;
    const includeParts: string[] = [];
    if (params.includeFacetCounts === true) includeParts.push("facet_counts");
    const include = includeParts.length > 0 ? includeParts.join(",") : undefined;

    return useQuery<ProductListEnvelope, Error, ProductsListResult>({
        queryKey: [
            "admin",
            "products",
            "list",
            {
                locale,
                page,
                perPage,
                sort: params.sort ?? "",
                status,
                type: params.type,
                stockStatus: params.stockStatus,
                stockLevel: params.stockLevel,
                catalogVisibility: params.catalogVisibility,
                categoryId: params.categoryId,
                brandId: params.brandId,
                tagId: params.tagId,
                onSale: params.onSale === true ? true : undefined,
                featured: params.featured === true ? true : undefined,
                hasImage: params.hasImage === true ? true : undefined,
                withTrashed: params.withTrashed === true ? true : undefined,
                onlyTrashed: params.onlyTrashed === true ? true : undefined,
                createdFrom: params.createdFrom,
                createdTo: params.createdTo,
                ids: params.ids?.join(","),
                search: params.search,
                favoriteIds: params.favoriteIds,
                include,
            },
        ],
        queryFn: () =>
            apiGet<ProductListEnvelope>("products", {
                locale,
                query: {
                    page,
                    perPage,
                    sort: params.sort,
                    status,
                    type: params.type,
                    stock_status: params.stockStatus,
                    stock_level: params.stockLevel,
                    catalog_visibility: params.catalogVisibility,
                    category: params.categoryId,
                    brand: params.brandId,
                    tag: params.tagId,
                    on_sale: params.onSale === true ? true : undefined,
                    featured: params.featured === true ? true : undefined,
                    has_image: params.hasImage === true ? true : undefined,
                    with_trashed: params.withTrashed === true ? true : undefined,
                    only_trashed: params.onlyTrashed === true ? true : undefined,
                    created_from: params.createdFrom,
                    created_to: params.createdTo,
                    ids: params.ids !== undefined && params.ids.length > 0 ? params.ids.join(",") : undefined,
                    search: params.search,
                    include,
                },
            }),
        placeholderData: keepPreviousData,
        select: (payload): ProductsListResult => {
            const data = (payload.data ?? []).map(toAdminProduct);
            const filtered =
                params.favoriteIds !== undefined && params.favoriteIds.length > 0
                    ? data.filter((row) => params.favoriteIds?.includes(row.id) === true)
                    : data;
            const meta = payload.meta ?? { page, perPage, total: filtered.length, lastPage: 1 };
            return { data: filtered, meta, facets: payload.facets };
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
 * `perPage=100`) and feeds them into the toolbar's faceted-filter options.
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
 * Per-status row counts powering the WP-style status tabs. Calls the dedicated counts endpoint
 * which returns `any | publish | draft | pending | private | trash` in one round-trip.
 */
export function useProductCountsByStatus() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "product-counts", { locale }],
        queryFn: async (): Promise<Partial<Record<"any" | "trash" | ProductStatus, number>>> => {
            try {
                const envelope = await apiGet<{ data: Record<string, number> }>("products/counts", {
                    locale,
                });
                return envelope.data as Partial<Record<"any" | "trash" | ProductStatus, number>>;
            } catch {
                return {};
            }
        },
        staleTime: 30 * 1000,
    });
}
