"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiMutate } from "#/lib/queries/api-client";

import { deleteReply, saveReply } from "./replies";

type SdkStatus = "pending" | "approved" | "spam" | "trash";

/**
 * Single-review moderation. Wraps `PATCH /admin/reviews/{id}` and also supports field-level
 * edits (rating / body / verified) used by the inline Quick Edit panel.
 */
export interface ModeratePayload {
    id: number;
    status?: SdkStatus;
    rating?: number;
    body?: string;
    verified?: boolean;
}

export function useModerateReview() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;

    return useMutation<unknown, Error, ModeratePayload>({
        mutationFn: ({ id, ...payload }) =>
            apiMutate<unknown>("PATCH", `reviews/${id}`, {
                locale,
                body: payload,
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "review-counts"] });
        },
    });
}

/**
 * Bulk moderate — issues sequential PATCH calls because the API has no batch endpoint.
 * TODO(api): expose `POST /admin/reviews/batch` so this can become a single round-trip.
 */
export function useBulkModerateReviews() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[]; status: SdkStatus }>({
        mutationFn: async ({ ids, status }) => {
            for (const id of ids) {
                await apiMutate<unknown>("PATCH", `reviews/${id}`, { locale, body: { status } });
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "review-counts"] });
        },
    });
}

/**
 * Move one or more reviews to Trash — a real moderation state on the API (`status: trash`),
 * not a client-side flag. Issues sequential PATCH calls (no batch endpoint yet).
 */
export function useTrashReviews() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<unknown>("PATCH", `reviews/${id}`, { locale, body: { status: "trash" } });
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "review-counts"] });
        },
    });
}

/** Restore one or more reviews out of Trash/Spam back to `pending` for re-moderation. */
export function useRestoreReviews() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<unknown>("PATCH", `reviews/${id}`, { locale, body: { status: "pending" } });
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "review-counts"] });
        },
    });
}

/** Hard-delete one or more reviews via `DELETE /admin/reviews/{id}` — permanent removal from Spam / Trash. */
export function useDeleteReviews() {
    const queryClient = useQueryClient();
    const locale = useLocale() as Locale;
    return useMutation<unknown, Error, { ids: number[] }>({
        mutationFn: async ({ ids }) => {
            for (const id of ids) {
                await apiMutate<unknown>("DELETE", `reviews/${id}`, { locale });
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "review-counts"] });
        },
    });
}

/**
 * Persist an admin reply. The reply is stored client-side — the API has no reply field yet — so
 * this never round-trips to the backend.
 *
 * TODO(api): replace the localStorage call with `POST /admin/reviews/{id}/reply`.
 */
export function useSaveReviewReply() {
    const queryClient = useQueryClient();
    return useMutation<unknown, Error, { id: number; body: string }>({
        mutationFn: async ({ id, body }) => {
            if (body.trim().length === 0) {
                deleteReply(id);
            } else {
                saveReply(id, body);
            }
            return undefined;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
        },
    });
}
