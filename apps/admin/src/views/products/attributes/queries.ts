"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminAttribute, LocalizedString } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminAttribute = Schemas["AdminAttribute"];

interface AttributeListEnvelope {
    data: SdkAdminAttribute[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

interface AttributeResourceEnvelope {
    data: SdkAdminAttribute;
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function normalizeOrderBy(value: string | null | undefined): AdminAttribute["orderBy"] {
    return value === "name" || value === "id" ? value : "menu_order";
}

function toAdminAttribute(a: SdkAdminAttribute): AdminAttribute {
    return {
        id: a.id,
        code: a.code,
        name: dup(a.name),
        termCount: 0,
        orderBy: normalizeOrderBy(a.order_by),
        hasArchives: Boolean(a.has_archives),
    };
}

const LIST_KEY = ["admin", "attributes", "list"] as const;

export interface AttributesListParams {
    page?: number;
    limit?: number;
    search?: string;
}

/**
 * Browser-side attributes list. The page seeds the cache with the SSR result (term counts +
 * term name previews are filled by SSR fan-out — the API listing doesn't carry them today),
 * so refetches after a mutation will lose the previews until the next full reload.
 */
export function useAttributesList(params: AttributesListParams = {}): UseQueryResult<AdminAttribute[], Error> {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const limit = params.limit ?? 200;
    const search = params.search;
    return useQuery<AttributeListEnvelope, Error, AdminAttribute[]>({
        queryKey: ["admin", "attributes", "list", { locale, page, limit, search }],
        queryFn: () => apiGet<AttributeListEnvelope>("attributes", { locale, query: { page, limit, q: search } }),
        select: (payload) => (payload.data ?? []).map(toAdminAttribute),
        staleTime: 30_000,
    });
}

export interface CreateAttributeInput {
    name: string;
    code: string;
    hasArchives: boolean;
    orderBy: AdminAttribute["orderBy"];
}

/**
 * Create an attribute. `code` is required and immutable upstream — the regex
 * `/^(?!pa_)[a-z0-9][a-z0-9-]*$/` is enforced by the validator. Type defaults to "select"; we
 * never expose the type knob today (out of scope), so the API default is fine to rely on.
 */
export function useCreateAttribute() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<AttributeResourceEnvelope, Error, CreateAttributeInput>({
        mutationFn: (input) =>
            apiMutate<AttributeResourceEnvelope>("POST", "attributes", {
                locale,
                body: {
                    code: input.code,
                    has_archives: input.hasArchives,
                    order_by: input.orderBy,
                    translations: [{ locale, name: input.name }],
                },
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

export interface UpdateAttributeInput {
    id: number;
    name: string;
    hasArchives: boolean;
    orderBy: AdminAttribute["orderBy"];
}

/**
 * Partial-update an attribute. The `code` field is immutable upstream (only set at create
 * time); the inspector locks the slug input on edit so the body never carries it. Optimistic
 * replace pattern mirrors the tags / brands hooks.
 */
export function useUpdateAttribute() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<
        AttributeResourceEnvelope,
        Error,
        UpdateAttributeInput,
        { previous: [readonly unknown[], AttributeListEnvelope | undefined][] }
    >({
        mutationFn: ({ id, name, hasArchives, orderBy }) =>
            apiMutate<AttributeResourceEnvelope>("PATCH", `attributes/${id}`, {
                locale,
                body: {
                    has_archives: hasArchives,
                    order_by: orderBy,
                    translations: [{ locale, name }],
                },
            }),
        onMutate: async ({ id, name, hasArchives, orderBy }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<AttributeListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<AttributeListEnvelope>(key, {
                    ...snapshot,
                    data: snapshot.data.map((row) =>
                        row.id === id ? { ...row, name, has_archives: hasArchives, order_by: orderBy } : row,
                    ),
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

/** Soft-delete an attribute. Upstream cascades to the attribute's terms and product links. */
export function useDeleteAttribute() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { id: number }, { previous: [readonly unknown[], AttributeListEnvelope | undefined][] }>({
        mutationFn: async ({ id }) => {
            await apiMutate<void>("DELETE", `attributes/${id}`, { locale });
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<AttributeListEnvelope>({ queryKey: LIST_KEY });
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<AttributeListEnvelope>(key, {
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

/** Sequentially soft-delete a batch of attributes. Matches the tags / brands bulk pattern. */
export function useBulkDeleteAttributes() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { ids: number[] }, { previous: [readonly unknown[], AttributeListEnvelope | undefined][] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<void>("DELETE", `attributes/${id}`, { locale });
            }
        },
        onMutate: async ({ ids }) => {
            await queryClient.cancelQueries({ queryKey: LIST_KEY });
            const previous = queryClient.getQueriesData<AttributeListEnvelope>({ queryKey: LIST_KEY });
            const drop = new Set(ids);
            for (const [key, snapshot] of previous) {
                if (snapshot === undefined) continue;
                queryClient.setQueryData<AttributeListEnvelope>(key, {
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

/** Used by `attributes-view.tsx` to seed the React Query cache from the SSR page payload. */
export function seedAttributesListKey({ locale, limit }: { locale: Locale; limit: number }) {
    return ["admin", "attributes", "list", { locale, page: 1, limit, search: undefined }] as const;
}
