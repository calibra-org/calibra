"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminTag, LocalizedString, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

interface TagListEnvelope {
    data: SdkAdminTaxonomy[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

interface TagResourceEnvelope {
    data: SdkAdminTaxonomy;
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function toAdminTag(t: SdkAdminTaxonomy): AdminTag {
    return { id: t.id, name: dup(t.name), slug: dup(t.slug), productCount: 0 };
}

const LIST_KEY = ["admin", "tags", "list"] as const;

export interface TagsListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

/**
 * Browser-side tags list. The page seeds the cache with the SSR result (including the
 * `productCount` fan-out that the API listing does not yet return), so we keep `staleTime`
 * generous and rely on mutation hooks below to bust the cache when content changes.
 *
 * TODO(api): include `product_count` on `GET /api/v1/admin/tags` so refetches after a
 * mutation don't drop the counts until the next full-page reload.
 */
export function useTagsList(params: TagsListParams = {}): UseQueryResult<Paginated<AdminTag>, Error> {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 200;
    const search = params.search;
    return useQuery<TagListEnvelope, Error, Paginated<AdminTag>>({
        queryKey: ["admin", "tags", "list", { locale, page, perPage, search }],
        queryFn: () => apiGet<TagListEnvelope>("tags", { locale, query: { page, perPage, search } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminTag),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
        staleTime: 30_000,
    });
}

export interface CreateTagInput {
    name: string;
    slug: string | null;
    description: string | null;
}

/**
 * Create a tag. Sends a single translation row in the active locale; the SDK schema lets the
 * `slug` default to a server-side slugify when omitted, so passing `null` is intentional when
 * the user hasn't touched the slug field.
 */
export function useCreateTag() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<TagResourceEnvelope, Error, CreateTagInput>({
        mutationFn: (input) =>
            apiMutate<TagResourceEnvelope>("POST", "tags", {
                locale,
                body: {
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

export interface UpdateTagInput {
    id: number;
    name: string;
    slug: string;
    description: string | null;
}

/**
 * Partial-update a tag via `PATCH /admin/tags/{id}`. Optimistically replaces the row in any
 * cached list snapshot so the inspector + the list reflect the change immediately; on error
 * the snapshot is restored and the query is invalidated to refetch the server's truth.
 */
export function useUpdateTag() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        TagResourceEnvelope,
        Error,
        UpdateTagInput,
        { previous: [readonly unknown[], TagListEnvelope | undefined][] }
    >({
        mutationFn: ({ id, name, slug, description }) =>
            apiMutate<TagResourceEnvelope>("PATCH", `tags/${id}`, {
                locale,
                body: {
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
            const previous = queryClient.getQueriesData<TagListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<TagListEnvelope>(key, {
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
 * Soft-delete a tag. `DELETE /admin/tags/{id}` detaches the tag from every product upstream,
 * so we drop the row from the cache immediately. Errors restore the snapshot.
 */
export function useDeleteTag() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { id: number }, { previous: [readonly unknown[], TagListEnvelope | undefined][] }>({
        mutationFn: async ({ id }) => {
            await apiMutate<void>("DELETE", `tags/${id}`, { locale });
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<TagListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<TagListEnvelope>(key, {
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
 * Sequentially soft-delete a batch of tags. Sequential rather than parallel keeps the
 * upstream's per-request rate accounting honest, and matches the bulk-trash hook used by
 * the products list. The mutation resolves when every row is acknowledged; partial failure
 * still benefits from optimistic removal of the rows that succeeded.
 */
export function useBulkDeleteTags() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { ids: number[] }, { previous: [readonly unknown[], TagListEnvelope | undefined][] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<void>("DELETE", `tags/${id}`, { locale });
            }
        },
        onMutate: async ({ ids }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<TagListEnvelope>({ queryKey: LIST_KEY });
            const drop = new Set(ids);
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<TagListEnvelope>(key, {
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

/** Used by `tags-view.tsx` to seed the React Query cache from the SSR page payload. */
export function seedTagsListKey({ locale, perPage }: { locale: Locale; perPage: number }) {
    return ["admin", "tags", "list", { locale, page: 1, perPage, search: undefined }] as const;
}
