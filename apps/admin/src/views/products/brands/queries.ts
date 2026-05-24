"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminBrand, LocalizedString, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

interface BrandListEnvelope {
    data: SdkAdminTaxonomy[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

interface BrandResourceEnvelope {
    data: SdkAdminTaxonomy;
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function toAdminBrand(b: SdkAdminTaxonomy): AdminBrand {
    return {
        id: b.id,
        name: dup(b.name),
        slug: dup(b.slug),
        productCount: 0,
        imageMediaId: b.image_media_id ?? null,
        logoUrl: b.image_url ?? null,
    };
}

const LIST_KEY = ["admin", "brands", "list"] as const;

export interface BrandsListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

/**
 * Browser-side brands list. The page seeds the cache with the SSR result (including the
 * `productCount` fan-out that the API listing does not yet return), so we keep `staleTime`
 * generous and rely on mutation hooks below to bust the cache when content changes.
 *
 * TODO(api): include `product_count` on `GET /api/v1/admin/brands` so refetches after a
 * mutation don't drop the counts until the next full-page reload.
 */
export function useBrandsList(params: BrandsListParams = {}): UseQueryResult<Paginated<AdminBrand>, Error> {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 200;
    const search = params.search;
    return useQuery<BrandListEnvelope, Error, Paginated<AdminBrand>>({
        queryKey: ["admin", "brands", "list", { locale, page, perPage, search }],
        queryFn: () => apiGet<BrandListEnvelope>("brands", { locale, query: { page, perPage, search } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminBrand),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
        staleTime: 30_000,
    });
}

export interface CreateBrandInput {
    name: string;
    slug: string | null;
    description: string | null;
    imageMediaId?: number | null;
}

/**
 * Create a brand. Sends a single translation row in the active locale; the SDK schema lets the
 * `slug` default to a server-side slugify when omitted, so passing `null` is intentional when
 * the user hasn't touched the slug field.
 */
export function useCreateBrand() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<BrandResourceEnvelope, Error, CreateBrandInput>({
        mutationFn: (input) =>
            apiMutate<BrandResourceEnvelope>("POST", "brands", {
                locale,
                body: {
                    ...(input.imageMediaId !== undefined && input.imageMediaId !== null
                        ? { image_media_id: input.imageMediaId }
                        : {}),
                    translations: [
                        {
                            locale,
                            name: input.name,
                            ...(input.slug !== null && input.slug.length > 0 ? { slug: input.slug } : {}),
                            ...(input.description !== null && input.description.length > 0
                                ? { description: input.description }
                                : {}),
                        },
                    ],
                },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

export interface UpdateBrandInput {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    /** Pass `undefined` to leave the linked media untouched, `null` to clear it. */
    imageMediaId?: number | null;
}

/**
 * Partial-update a brand via `PATCH /admin/brands/{id}`. Optimistically replaces the row in any
 * cached list snapshot so the inspector + the list reflect the change immediately; on error
 * the snapshot is restored and the query is invalidated to refetch the server's truth.
 */
export function useUpdateBrand() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        BrandResourceEnvelope,
        Error,
        UpdateBrandInput,
        { previous: [readonly unknown[], BrandListEnvelope | undefined][] }
    >({
        mutationFn: ({ id, name, slug, description, imageMediaId }) =>
            apiMutate<BrandResourceEnvelope>("PATCH", `brands/${id}`, {
                locale,
                body: {
                    ...(imageMediaId !== undefined ? { image_media_id: imageMediaId } : {}),
                    translations: [
                        {
                            locale,
                            name,
                            ...(slug.length > 0 ? { slug } : {}),
                            ...(description !== null && description.length > 0 ? { description } : {}),
                        },
                    ],
                },
            }),
        onMutate: async ({ id, name, slug }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<BrandListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<BrandListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.map((row) => (row.id === id ? { ...row, name, slug } : row)),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [key, snapshot] of context.previous) queryClient.setQueryData(key, snapshot);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/**
 * Soft-delete a brand. `DELETE /admin/brands/{id}` detaches the brand from every product
 * upstream, so we drop the row from the cache immediately. Errors restore the snapshot.
 */
export function useDeleteBrand() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { id: number }, { previous: [readonly unknown[], BrandListEnvelope | undefined][] }>({
        mutationFn: async ({ id }) => {
            await apiMutate<void>("DELETE", `brands/${id}`, { locale });
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<BrandListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<BrandListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.filter((row) => row.id !== id),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [key, snapshot] of context.previous) queryClient.setQueryData(key, snapshot);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/**
 * Sequentially soft-delete a batch of brands. Sequential rather than parallel keeps the
 * upstream's per-request rate accounting honest. The mutation resolves when every row is
 * acknowledged; partial failure still benefits from optimistic removal of the rows that
 * succeeded.
 */
export function useBulkDeleteBrands() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { ids: number[] }, { previous: [readonly unknown[], BrandListEnvelope | undefined][] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<void>("DELETE", `brands/${id}`, { locale });
            }
        },
        onMutate: async ({ ids }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<BrandListEnvelope>({ queryKey: LIST_KEY });
            const drop = new Set(ids);
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<BrandListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.filter((row) => !drop.has(row.id)),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [key, snapshot] of context.previous) queryClient.setQueryData(key, snapshot);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/** Used by `brands-view.tsx` to seed the React Query cache from the SSR page payload. */
export function seedBrandsListKey({ locale, perPage }: { locale: Locale; perPage: number }) {
    return ["admin", "brands", "list", { locale, page: 1, perPage, search: undefined }] as const;
}
