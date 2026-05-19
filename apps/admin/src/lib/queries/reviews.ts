"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminReview } from "#/lib/adapters/reviews";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminReview, Paginated, ReviewStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];

interface ReviewListEnvelope {
    data: Schemas["AdminReview"][];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

export interface ReviewsListParams {
    page?: number;
    perPage?: number;
    status?: ReviewStatus | "any";
}

/**
 * Paginated admin reviews list. The view distinguishes `spam` and `trash` while the API only
 * knows `rejected` — both collapse to that on the wire and the adapter remaps them back.
 */
export function useReviewsList(params: ReviewsListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const sdkStatus: "pending" | "approved" | "rejected" | undefined =
        params.status === "approved"
            ? "approved"
            : params.status === "pending"
              ? "pending"
              : params.status === "spam" || params.status === "trash"
                ? "rejected"
                : undefined;
    return useQuery<ReviewListEnvelope, Error, Paginated<AdminReview>>({
        queryKey: ["admin", "reviews", "list", { locale, page, perPage, sdkStatus }],
        queryFn: () => apiGet<ReviewListEnvelope>("reviews", { locale, query: { page, perPage, status: sdkStatus } }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminReview),
            meta: payload.meta ?? { page, perPage, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}
