"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiMutate } from "#/lib/queries/api-client";
import type { AdminAttribute } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminAttribute = Schemas["AdminAttribute"];

/**
 * Cached list-row shape mutated optimistically by the hooks below. Matches the envelope the
 * read hook in `#/lib/queries/attributes` writes into the `["admin","attributes","list"]` cache.
 */
interface AttributeListEnvelope {
    data: SdkAdminAttribute[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

interface AttributeResourceEnvelope {
    data: SdkAdminAttribute;
}

const LIST_KEY = ["admin", "attributes", "list"] as const;

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
