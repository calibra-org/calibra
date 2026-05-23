"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type { AdminCategory, LocalizedString, Paginated } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

interface CategoryListEnvelope {
    data: SdkAdminTaxonomy[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

interface CategoryResourceEnvelope {
    data: SdkAdminTaxonomy;
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function toAdminCategory(c: SdkAdminTaxonomy): AdminCategory {
    return {
        id: c.id,
        parentId: c.parent_id ?? null,
        name: dup(c.name),
        slug: dup(c.slug),
        productCount: 0,
        imageMediaId: c.image_media_id ?? null,
        imageUrl: c.image_url ?? null,
    };
}

const LIST_KEY = ["admin", "categories", "list"] as const;

export interface CategoriesListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

/**
 * Browser-side categories list — kept in sync with the server-rendered seed so reorders and
 * edits invalidate the cache instead of forcing a full page reload.
 *
 * `productCount` is sent as zero by the API listing today; the server-rendered page hydrates
 * the initial counts. Refetches after mutations therefore lose counts until the API exposes
 * them on the index payload (TODO below).
 *
 * TODO(api): include `product_count` on `GET /api/v1/admin/categories` so this hook returns
 * fully-populated rows without the fan-out the SSR repo does today.
 */
export function useCategoriesList(params: CategoriesListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 200;
    const search = params.search;
    return useQuery<CategoryListEnvelope, Error, Paginated<AdminCategory>>({
        queryKey: ["admin", "categories", "list", { locale, page, perPage, search }],
        queryFn: () => apiGet<CategoryListEnvelope>("categories", { locale, query: { page, perPage, search } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCategory),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}

export interface CreateCategoryInput {
    name: string;
    slug: string | null;
    description: string | null;
    parentId: number | null;
    imageMediaId?: number | null;
}

/** Create a category. Optional parent nesting; locale-resolved name + slug ship as one translation row. */
export function useCreateCategory() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<CategoryResourceEnvelope, Error, CreateCategoryInput>({
        mutationFn: (input) =>
            apiMutate<CategoryResourceEnvelope>("POST", "categories", {
                locale,
                body: {
                    ...(input.parentId !== null ? { parent_id: input.parentId } : {}),
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

export interface UpdateCategoryInput {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    parentId: number | null;
    /** Pass `undefined` to leave the linked media untouched, `null` to clear it. */
    imageMediaId?: number | null;
}

/** Partial-update a category. */
export function useUpdateCategory() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<CategoryResourceEnvelope, Error, UpdateCategoryInput>({
        mutationFn: ({ id, name, slug, description, parentId, imageMediaId }) =>
            apiMutate<CategoryResourceEnvelope>("PATCH", `categories/${id}`, {
                locale,
                body: {
                    parent_id: parentId,
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
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/**
 * Soft-delete a category. Upstream cascades via `parent_id` foreign keys — children are
 * orphaned to the parent's grandparent (or root) per the API contract. The view rolls back on
 * error and re-invalidates on success.
 */
export function useDeleteCategory() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { id: number }>({
        mutationFn: async ({ id }) => {
            await apiMutate<void>("DELETE", `categories/${id}`, { locale });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}

/** Sequentially soft-delete a batch of categories. Order is preserved by the operator's selection. */
export function useBulkDeleteCategories() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<void, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<void>("DELETE", `categories/${id}`, { locale });
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
        },
    });
}
