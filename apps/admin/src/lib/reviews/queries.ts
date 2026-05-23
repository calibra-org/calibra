"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { type AdapterContext, toAdminReview } from "#/lib/adapters/reviews";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminReview, LocalizedString, Paginated, ReviewStatus } from "#/lib/types";

import { loadReplies, subscribeToReplies } from "./replies";
import { loadTrashedIds, subscribeToTrash } from "./trash";

type Schemas = AdminSchemas["schemas"];

interface ReviewListEnvelope {
    data: Schemas["AdminReview"][];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

interface ProductRowEnvelope {
    data: { id: number; name: string; slug: string; translations?: { locale: string; name?: string; slug?: string }[] }[];
}

export interface ReviewsListParams {
    page?: number;
    perPage?: number;
    sort?: string;
    status?: ReviewStatus | "any";
    rating?: 1 | 2 | 3 | 4 | 5;
    productId?: number;
    verified?: boolean;
    search?: string;
}

/**
 * Subscribes to the client-side trash + reply stores so dependent queries re-run when the
 * operator toggles either. Mirrors the favorites hook used by the products list.
 */
function useClientReviewExtras(): {
    trashedIds: ReadonlySet<number>;
    replies: Record<number, { body: string; updatedAt: string } | undefined>;
} {
    const [trashedIds, setTrashedIds] = useState<ReadonlySet<number>>(() => loadTrashedIds());
    const [replies, setReplies] = useState(() => loadReplies());

    useEffect(() => subscribeToTrash(() => setTrashedIds(loadTrashedIds())), []);
    useEffect(() => subscribeToReplies(() => setReplies(loadReplies())), []);

    return { trashedIds, replies };
}

/**
 * Lightweight product lookup so columns can render the product title instead of `#42`. Pulls
 * the first 200 products through the cached query — enough for the demo dataset; production
 * needs a per-id batch endpoint.
 *
 * TODO(api): once `/admin/reviews` includes product `name` / `slug` in the response payload, the
 * lookup query becomes dead weight and can be deleted.
 */
export function useReviewProductLookup() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "reviews", "product-lookup", { locale }],
        queryFn: async (): Promise<Map<number, { name: LocalizedString; slug: LocalizedString }>> => {
            const payload = await apiGet<ProductRowEnvelope>("products", { locale, query: { perPage: 200 } });
            const out = new Map<number, { name: LocalizedString; slug: LocalizedString }>();
            for (const row of payload.data) {
                const fa = row.translations?.find((t) => t.locale === "fa") ??
                    row.translations?.[0] ?? { name: row.name, slug: row.slug };
                const en = row.translations?.find((t) => t.locale === "en") ?? fa;
                out.set(row.id, {
                    name: { fa: fa?.name ?? row.name, en: en?.name ?? row.name },
                    slug: { fa: fa?.slug ?? row.slug, en: en?.slug ?? row.slug },
                });
            }
            return out;
        },
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Paginated admin reviews list. The view distinguishes `spam` and `trash` while the API only
 * knows `rejected` — both collapse to that on the wire and the adapter remaps trashed ids back
 * via the client-side store. Free-text search and `trash` filtering happen client-side because
 * the API has no equivalent yet (see TODOs).
 */
export function useReviewsList(params: ReviewsListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const { trashedIds, replies } = useClientReviewExtras();
    const { data: productLookup } = useReviewProductLookup();

    const sdkStatus: "pending" | "approved" | "rejected" | undefined =
        params.status === "approved"
            ? "approved"
            : params.status === "pending"
              ? "pending"
              : params.status === "spam" || params.status === "trash"
                ? "rejected"
                : undefined;

    return useQuery<ReviewListEnvelope, Error, Paginated<AdminReview>>({
        queryKey: [
            "admin",
            "reviews",
            "list",
            {
                locale,
                page,
                perPage,
                sort: params.sort ?? "",
                sdkStatus,
                rating: params.rating,
                productId: params.productId,
                verified: params.verified,
                search: params.search ?? "",
                /**
                 * Pull the trashed-ids set into the cache key so flipping the trash tab refetches
                 * with the right post-filter without colliding with the un-trashed list.
                 */
                trashSize: trashedIds.size,
            },
        ],
        queryFn: () =>
            apiGet<ReviewListEnvelope>("reviews", {
                locale,
                query: {
                    page,
                    perPage,
                    status: sdkStatus,
                    rating: params.rating,
                    product_id: params.productId,
                    verified: params.verified,
                },
            }),
        placeholderData: keepPreviousData,
        select: (payload): Paginated<AdminReview> => {
            const ctx: AdapterContext = { products: productLookup, trashedIds, replies };
            const rowsAll = (payload.data ?? []).map((row) => toAdminReview(row, ctx));

            const tabFilter = (row: AdminReview): boolean => {
                if (params.status === "trash") return row.status === "trash";
                if (params.status === "spam") return row.status === "spam";
                if (params.status === "approved") return row.status === "approved";
                if (params.status === "pending") return row.status === "pending";
                /** `any` and `undefined` exclude the trash bucket — WordPress hides trashed rows from "All". */
                return row.status !== "trash";
            };

            const term = params.search?.trim().toLowerCase() ?? "";
            const searchFilter = (row: AdminReview): boolean => {
                if (term.length === 0) return true;
                /** TODO(api): server-side search across body/reviewer/email — currently a post-filter. */
                return (
                    row.reviewerName.toLowerCase().includes(term) ||
                    row.reviewerEmail.toLowerCase().includes(term) ||
                    row.body.toLowerCase().includes(term) ||
                    row.productName.fa.toLowerCase().includes(term) ||
                    row.productName.en.toLowerCase().includes(term)
                );
            };

            const filtered = rowsAll.filter((row) => tabFilter(row) && searchFilter(row));
            const sorted = sortReviews(filtered, params.sort);
            const meta = payload.meta ?? { page, perPage, total: filtered.length, lastPage: 1 };
            return { data: sorted, meta };
        },
    });
}

function sortReviews(rows: AdminReview[], spec: string | undefined): AdminReview[] {
    if (spec === undefined || spec === "") return rows;
    const direction = spec.startsWith("-") ? "desc" : "asc";
    const id = spec.startsWith("-") ? spec.slice(1) : spec;
    const copy = [...rows];
    copy.sort((a, b) => {
        const av = sortValue(a, id);
        const bv = sortValue(b, id);
        if (av < bv) return direction === "asc" ? -1 : 1;
        if (av > bv) return direction === "asc" ? 1 : -1;
        return 0;
    });
    return copy;
}

function sortValue(row: AdminReview, id: string): number | string {
    switch (id) {
        case "rating":
            return row.rating;
        case "reviewer":
            return row.reviewerName.toLowerCase();
        case "product":
            return row.productName.fa.toLowerCase();
        case "date":
            return row.createdAt;
        default:
            return row.id;
    }
}

/**
 * Per-status row counts powering the WP-style status tabs. Each call lands on a cached
 * `?perPage=1` request so flipping tabs reuses the count without a refetch. `trash` is derived
 * from the local trash store rather than the API.
 */
export function useReviewCountsByStatus() {
    const locale = useLocale() as Locale;
    const { trashedIds } = useClientReviewExtras();
    return useQuery({
        queryKey: ["admin", "review-counts", { locale, trashSize: trashedIds.size }],
        queryFn: async (): Promise<Partial<Record<"any" | ReviewStatus, number>>> => {
            const fetchTotal = async (status?: "pending" | "approved" | "rejected"): Promise<number | undefined> => {
                try {
                    const payload = await apiGet<ReviewListEnvelope>("reviews", {
                        locale,
                        query: { perPage: 1, status },
                    });
                    return payload.meta?.total ?? payload.data?.length ?? 0;
                } catch {
                    return undefined;
                }
            };
            const [anyTotal, pending, approved, rejected] = await Promise.all([
                fetchTotal(undefined),
                fetchTotal("pending"),
                fetchTotal("approved"),
                fetchTotal("rejected"),
            ]);
            const trashCount = trashedIds.size;
            const spam = rejected !== undefined ? Math.max(0, rejected - trashCount) : undefined;
            const adjustedAny = anyTotal !== undefined ? Math.max(0, anyTotal - trashCount) : undefined;
            return { any: adjustedAny, pending, approved, spam, trash: trashCount };
        },
        staleTime: 30 * 1000,
    });
}

interface FacetOption {
    value: string;
    label: string;
    count?: number;
}

/**
 * Facet options for the toolbar. Ratings are derived from the enum; products are pulled from the
 * product lookup so the popover always has labels.
 */
export function useReviewFacets() {
    const { data: lookup, isPending } = useReviewProductLookup();
    return {
        ratings: [5, 4, 3, 2, 1].map<FacetOption>((rating) => ({ value: String(rating), label: `${rating}` })),
        products: Array.from(lookup?.entries() ?? []).map<FacetOption>(([id, entry]) => ({
            value: String(id),
            label: entry.name.fa.length > 0 ? entry.name.fa : `#${id}`,
        })),
        isLoading: isPending,
    };
}
