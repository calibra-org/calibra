"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminAttributeTerm, LocalizedString } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

interface TermListEnvelope {
    data: SdkAdminTaxonomy[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

interface TermResourceEnvelope {
    data: SdkAdminTaxonomy;
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function toAdminTerm(attributeId: number, t: SdkAdminTaxonomy): AdminAttributeTerm {
    return {
        id: t.id,
        attributeId,
        name: dup(t.name),
        slug: t.slug,
    };
}

const listKey = (attributeId: number) => ["admin", "attribute-terms", attributeId, "list"] as const;

export interface TermsListParams {
    attributeId: number;
    page?: number;
    perPage?: number;
    search?: string;
}

/**
 * Browser-side terms list scoped to a single attribute. The page seeds the cache with the SSR
 * snapshot. Refetches after a mutation rely on the live API listing — no product-count
 * fan-out today (terms don't carry product attachments in the index payload).
 */
export function useAttributeTermsList(params: TermsListParams): UseQueryResult<AdminAttributeTerm[], Error> {
    const locale = useLocale() as Locale;
    const { attributeId } = params;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 200;
    const search = params.search;
    return useQuery<TermListEnvelope, Error, AdminAttributeTerm[]>({
        queryKey: ["admin", "attribute-terms", attributeId, "list", { locale, page, perPage, search }],
        queryFn: () =>
            apiGet<TermListEnvelope>(`attributes/${attributeId}/terms`, {
                locale,
                query: { page, perPage, search },
            }),
        select: (payload) => (payload.data ?? []).map((row) => toAdminTerm(attributeId, row)),
        staleTime: 30_000,
    });
}

export interface CreateTermInput {
    attributeId: number;
    name: string;
    slug: string | null;
    description: string | null;
}

/**
 * Create a term under an attribute. Sends one translation row in the active locale; the SDK
 * lets the server fall back to a slugify on omitted `slug`, so passing `null` is intentional.
 */
export function useCreateAttributeTerm() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<TermResourceEnvelope, Error, CreateTermInput>({
        mutationFn: (input) =>
            apiMutate<TermResourceEnvelope>("POST", `attributes/${input.attributeId}/terms`, {
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
        onSuccess: (_data, vars) => {
            void queryClient.invalidateQueries({ queryKey: listKey(vars.attributeId) });
        },
    });
}

export interface UpdateTermInput {
    attributeId: number;
    id: number;
    name: string;
    slug: string;
    description: string | null;
}

/** Partial-update a term. Optimistic replace mirrors the tags / brands pattern. */
export function useUpdateAttributeTerm() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        TermResourceEnvelope,
        Error,
        UpdateTermInput,
        { previous: [readonly unknown[], TermListEnvelope | undefined][] }
    >({
        mutationFn: ({ attributeId, id, name, slug, description }) =>
            apiMutate<TermResourceEnvelope>("PATCH", `attributes/${attributeId}/terms/${id}`, {
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
        onMutate: async ({ attributeId, id, name, slug }) => {
            const key = listKey(attributeId);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueriesData<TermListEnvelope>({ queryKey: key });
            for (const [k, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<TermListEnvelope>(k, {
                    ...snapshot,
                    data: snapshot.data.map((row) => (row.id === id ? { ...row, name, slug } : row)),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [k, snapshot] of context.previous) queryClient.setQueryData(k, snapshot);
        },
        onSettled: (_data, _error, vars) => {
            void queryClient.invalidateQueries({ queryKey: listKey(vars.attributeId) });
        },
    });
}

/** Delete a single term. */
export function useDeleteAttributeTerm() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        void,
        Error,
        { attributeId: number; id: number },
        { previous: [readonly unknown[], TermListEnvelope | undefined][] }
    >({
        mutationFn: async ({ attributeId, id }) => {
            await apiMutate<void>("DELETE", `attributes/${attributeId}/terms/${id}`, { locale });
        },
        onMutate: async ({ attributeId, id }) => {
            const key = listKey(attributeId);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueriesData<TermListEnvelope>({ queryKey: key });
            for (const [k, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<TermListEnvelope>(k, {
                    ...snapshot,
                    data: snapshot.data.filter((row) => row.id !== id),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [k, snapshot] of context.previous) queryClient.setQueryData(k, snapshot);
        },
        onSettled: (_data, _error, vars) => {
            void queryClient.invalidateQueries({ queryKey: listKey(vars.attributeId) });
        },
    });
}

/** Sequentially delete a batch of terms under one attribute. */
export function useBulkDeleteAttributeTerms() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        void,
        Error,
        { attributeId: number; ids: number[] },
        { previous: [readonly unknown[], TermListEnvelope | undefined][] }
    >({
        mutationFn: async ({ attributeId, ids }) => {
            for (const id of ids) {
                await apiMutate<void>("DELETE", `attributes/${attributeId}/terms/${id}`, { locale });
            }
        },
        onMutate: async ({ attributeId, ids }) => {
            const key = listKey(attributeId);
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueriesData<TermListEnvelope>({ queryKey: key });
            const drop = new Set(ids);
            for (const [k, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<TermListEnvelope>(k, {
                    ...snapshot,
                    data: snapshot.data.filter((row) => !drop.has(row.id)),
                });
            }
            return { previous };
        },
        onError: (_error, _vars, context) => {
            if (context === undefined) return;
            for (const [k, snapshot] of context.previous) queryClient.setQueryData(k, snapshot);
        },
        onSettled: (_data, _error, vars) => {
            void queryClient.invalidateQueries({ queryKey: listKey(vars.attributeId) });
        },
    });
}

/** Used by `attribute-terms-view.tsx` to seed the React Query cache from the SSR payload. */
export function seedAttributeTermsListKey({
    attributeId,
    locale,
    perPage,
}: {
    attributeId: number;
    locale: Locale;
    perPage: number;
}) {
    return ["admin", "attribute-terms", attributeId, "list", { locale, page: 1, perPage, search: undefined }] as const;
}
