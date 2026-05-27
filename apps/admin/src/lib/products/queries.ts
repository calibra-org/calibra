"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { type AdminProductDetailView, toAdminProductDetail } from "#/lib/adapters/product-detail";
import { toAdminProduct } from "#/lib/adapters/products";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminBrand, AdminCategory, AdminProduct, AdminTag, ProductStatus, ProductType, StockStatus } from "#/lib/types";

type DetailEnvelope = { data: AdminSchemas["schemas"]["AdminProductDetail"] };

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
            /**
             * Favorites is client-side until the API ships it. When `favoriteIds` is provided
             * (toggle is ON), filter every time — including the empty-set case so the operator
             * sees "no favorites yet" instead of the full list silently ignoring the toggle.
             */
            const filtered =
                params.favoriteIds === undefined ? data : data.filter((row) => params.favoriteIds?.includes(row.id) === true);
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

/**
 * Fetches a single product's full detail payload, normalised into the view shape. The cache key
 * scopes by id; consumers passing `initialData` from the server-rendered shell skip the
 * first-paint round-trip.
 */
export function useProduct(
    id: number | null,
    options?: { initialData?: AdminProductDetailView },
): ReturnType<typeof useQuery<DetailEnvelope, Error, AdminProductDetailView>> {
    const locale = useLocale() as Locale;
    return useQuery<DetailEnvelope, Error, AdminProductDetailView>({
        queryKey: ["admin", "product", id, locale],
        enabled: id !== null && id !== undefined,
        queryFn: async () => apiGet<DetailEnvelope>(`products/${id}`, { locale }),
        select: (envelope) => toAdminProductDetail(envelope.data),
        initialData: options?.initialData
            ? ({
                  data: options.initialData as unknown as AdminSchemas["schemas"]["AdminProductDetail"],
              } as DetailEnvelope)
            : undefined,
        staleTime: 5 * 1000,
    });
}

export interface VariationView {
    id: number;
    sku: string | null;
    gtin: string | null;
    regularPriceMinor: number | null;
    salePriceMinor: number | null;
    saleStartsAt: string | null;
    saleEndsAt: string | null;
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    imageMediaId: number | null;
    virtual: boolean;
    downloadable: boolean;
    manageStockMode: "own" | "parent";
    menuOrder: number;
    pins: { attribute_id: number; term_id: number | null }[];
    description: string | null;
}

/** Reads the variations list for a variable product. */
export function useProductVariations(productId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: unknown[] }, Error, VariationView[]>({
        queryKey: ["admin", "product-variations", productId, locale],
        enabled: productId !== null && productId !== undefined,
        queryFn: async () => apiGet<{ data: unknown[] }>(`products/${productId}/variations`, { locale }),
        select: (envelope) =>
            envelope.data.map((row) => {
                const r = row as Record<string, unknown>;
                return {
                    id: Number(r.id),
                    sku: (r.sku as string | null) ?? null,
                    gtin: (r.gtin as string | null) ?? null,
                    regularPriceMinor: r.regular_price === null || r.regular_price === undefined ? null : Number(r.regular_price),
                    salePriceMinor: r.sale_price === null || r.sale_price === undefined ? null : Number(r.sale_price),
                    saleStartsAt: (r.sale_starts_at as string | null) ?? null,
                    saleEndsAt: (r.sale_ends_at as string | null) ?? null,
                    weightGrams: (r.weight_grams as number | null) ?? null,
                    lengthMm: (r.length_mm as number | null) ?? null,
                    widthMm: (r.width_mm as number | null) ?? null,
                    heightMm: (r.height_mm as number | null) ?? null,
                    imageMediaId: (r.image_media_id as number | null) ?? null,
                    virtual: Boolean(r.virtual),
                    downloadable: Boolean(r.downloadable),
                    manageStockMode: ((r.manage_stock_mode as string) ?? "own") as "own" | "parent",
                    menuOrder: Number((r.menu_order as number | undefined) ?? 0),
                    pins: ((r.attribute_pins as { attribute_id: number; term_id: number | null }[] | undefined) ?? []).map(
                        (p) => ({
                            attribute_id: Number(p.attribute_id),
                            term_id: p.term_id === null || p.term_id === undefined ? null : Number(p.term_id),
                        }),
                    ),
                    description: (r.description as string | null) ?? null,
                };
            }),
        staleTime: 10 * 1000,
    });
}

/**
 * Global attributes list — used by the Add-attribute popover on the Attributes card. Cached
 * aggressively since the taxonomy rarely changes.
 */
export function useGlobalAttributes() {
    const locale = useLocale() as Locale;
    return useQuery<{ data: { id: number; name?: string; code?: string }[] }, Error, { id: number; name: string }[]>({
        queryKey: ["admin", "attributes", "global", locale],
        queryFn: async () => apiGet<{ data: { id: number; name?: string; code?: string }[] }>("attributes", { locale }),
        select: (envelope) => envelope.data.map((row) => ({ id: Number(row.id), name: row.name ?? row.code ?? `#${row.id}` })),
        staleTime: 5 * 60 * 1000,
    });
}

/** Per-attribute terms list — used by the term chip picker on attribute-link rows. */
export function useGlobalAttributeTerms(attributeId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: { id: number; name?: string; slug?: string }[] }, Error, { id: number; name: string }[]>({
        queryKey: ["admin", "attributes", attributeId, "terms", locale],
        enabled: attributeId !== null && attributeId !== undefined,
        queryFn: async () =>
            apiGet<{ data: { id: number; name?: string; slug?: string }[] }>(`attributes/${attributeId}/terms`, { locale }),
        select: (envelope) => envelope.data.map((row) => ({ id: Number(row.id), name: row.name ?? row.slug ?? `#${row.id}` })),
        staleTime: 60 * 1000,
    });
}

/* -------------------------------------------------------------------------- */
/*  Taxonomy pickers (categories / tags / brands sidebar cards)               */
/* -------------------------------------------------------------------------- */

type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

function dupLocalized(value: string | null | undefined): { fa: string; en: string } {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function toPickerCategory(row: SdkAdminTaxonomy): AdminCategory {
    return {
        id: Number(row.id),
        parentId: row.parent_id ?? null,
        name: dupLocalized(row.name),
        slug: dupLocalized(row.slug),
        productCount: row.used_count ?? 0,
        imageMediaId: row.image_media_id ?? null,
        imageUrl: row.image_url ?? null,
    };
}

function toPickerTag(row: SdkAdminTaxonomy): AdminTag {
    return {
        id: Number(row.id),
        name: dupLocalized(row.name),
        slug: dupLocalized(row.slug),
        productCount: row.used_count ?? 0,
    };
}

function toPickerBrand(row: SdkAdminTaxonomy): AdminBrand {
    return {
        id: Number(row.id),
        name: dupLocalized(row.name),
        slug: dupLocalized(row.slug),
        productCount: row.used_count ?? 0,
        imageMediaId: row.image_media_id ?? null,
        logoUrl: row.image_url ?? null,
    };
}

interface TaxonomyEnvelopeAdmin<T> {
    data: T[];
}

export type TaxonomySort = "-used_count" | "used_count" | "menu_order" | "-menu_order";

/**
 * Fetches the full categories tree for the product-detail picker. Caps at 500 rows by default —
 * the bulk seeder ships 56 leaves, so this comfortably covers any store the admin is going to
 * curate by hand. `sort` defaults to `menu_order`; pass `-used_count` to power the "Most used"
 * tab without paying for a second query.
 */
export function useCategoriesTree(options?: { sort?: TaxonomySort; perPage?: number }) {
    const locale = useLocale() as Locale;
    const sort = options?.sort;
    const perPage = options?.perPage ?? 500;
    return useQuery<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>, Error, AdminCategory[]>({
        queryKey: ["admin", "categories", "picker", { locale, sort: sort ?? "", perPage }],
        queryFn: () =>
            apiGet<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>>("categories", {
                locale,
                query: { perPage, ...(sort !== undefined ? { sort } : {}) },
            }),
        select: (envelope) => (envelope.data ?? []).map(toPickerCategory),
        staleTime: 30 * 1000,
    });
}

/** Top-N most-used categories for the "پر استفاده‌ها" tab. Cached server-side for 2m. */
export function useMostUsedCategories(limit = 20) {
    return useCategoriesTree({ sort: "-used_count", perPage: limit });
}

/** Flat brands list. `parent_id` is always null upstream; the picker renders them at depth 0. */
export function useBrandsList(options?: { sort?: TaxonomySort; perPage?: number }) {
    const locale = useLocale() as Locale;
    const sort = options?.sort;
    const perPage = options?.perPage ?? 500;
    return useQuery<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>, Error, AdminBrand[]>({
        queryKey: ["admin", "brands", "picker", { locale, sort: sort ?? "", perPage }],
        queryFn: () =>
            apiGet<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>>("brands", {
                locale,
                query: { perPage, ...(sort !== undefined ? { sort } : {}) },
            }),
        select: (envelope) => (envelope.data ?? []).map(toPickerBrand),
        staleTime: 30 * 1000,
    });
}

/** Top-N most-used brands for the brand sidebar's "Most used" tab. */
export function useMostUsedBrands(limit = 20) {
    return useBrandsList({ sort: "-used_count", perPage: limit });
}

/**
 * Top-N most-used tags rendered as clickable chips below the tags chip-picker. Backed by the
 * 2m server-side cache.
 */
export function useMostUsedTags(limit = 10) {
    const locale = useLocale() as Locale;
    return useQuery<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>, Error, AdminTag[]>({
        queryKey: ["admin", "tags", "most-used", { locale, limit }],
        queryFn: () =>
            apiGet<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>>("tags", {
                locale,
                query: { perPage: limit, sort: "-used_count" },
            }),
        select: (envelope) => (envelope.data ?? []).map(toPickerTag),
        staleTime: 30 * 1000,
    });
}

/* -------------------------------------------------------------------------- */
/*  Tag chip-picker async helpers (ResourcePicker integration)                */
/* -------------------------------------------------------------------------- */

/**
 * Async search adapter that feeds the {@link ResourcePicker} multi-creatable picker on the tags
 * card. The picker debounces internally; we just resolve a list of `{id, label}` options.
 */
export async function searchTags(query: string, locale: string): Promise<{ id: number; label: string }[]> {
    const envelope = await apiGet<TaxonomyEnvelopeAdmin<SdkAdminTaxonomy>>("tags", {
        locale,
        query: { perPage: 25, ...(query.length > 0 ? { search: query } : {}) },
    });
    return (envelope.data ?? []).map((row) => ({ id: Number(row.id), label: row.name ?? `#${row.id}` }));
}

/**
 * Resolves a list of tag ids back to `{id, label}` options on form mount, so existing chips
 * render with their Persian names instead of `#42` placeholders.
 *
 * Fetches each id through `GET /admin/tags/{id}` rather than scanning the paginated index —
 * with N saved tags spread across the catalog, the index lookup would miss any tag that
 * doesn't land in the first page and leave the chip stuck on its `#${id}` fallback.
 */
export async function resolveTags(ids: (number | string)[], locale: string): Promise<{ id: number; label: string }[]> {
    const numericIds = ids
        .map((value) => (typeof value === "number" ? value : Number(value)))
        .filter((value) => Number.isFinite(value));
    if (numericIds.length === 0) return [];
    const results = await Promise.all(
        numericIds.map(async (id) => {
            try {
                const res = await apiGet<{ data: SdkAdminTaxonomy }>(`tags/${id}`, { locale });
                return res.data;
            } catch {
                return null;
            }
        }),
    );
    return results
        .filter((row): row is SdkAdminTaxonomy => row !== null)
        .map((row) => ({ id: Number(row.id), label: row.name ?? `#${row.id}` }));
}

/**
 * Debounced async slug availability check. The hook is intentionally NOT a `useMutation`; it's a
 * read-after-blur predicate the form treats as a hint, not a write. Callers pass the current slug
 * + locale and (when editing) the row's own id to exclude.
 */
export function useSlugAvailability(args: {
    slug: string | null;
    locale: Locale;
    excludeId?: number;
}): ReturnType<typeof useQuery<{ data: { available: boolean } }, Error, boolean>> {
    const trimmed = args.slug?.trim() ?? "";
    return useQuery<{ data: { available: boolean } }, Error, boolean>({
        queryKey: ["admin", "products", "check-slug", args.locale, trimmed, args.excludeId ?? null],
        enabled: trimmed.length > 0,
        queryFn: async () =>
            apiGet<{ data: { available: boolean } }>("products/check-slug", {
                locale: args.locale,
                query: {
                    slug: trimmed,
                    locale: args.locale,
                    ...(args.excludeId !== undefined ? { excludeId: args.excludeId } : {}),
                },
            }),
        select: (envelope) => envelope.data.available,
        staleTime: 5 * 1000,
    });
}
