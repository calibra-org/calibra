"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { type AdapterContext, toAdminReview } from "#/lib/adapters/reviews";
import { apiGet } from "#/lib/queries/api-client";
import { type TableViewQuery, tableViewQueryToSdkQuery } from "#/lib/table-view";
import type { AdminReview, LocalizedString, Paginated, ReviewStatus } from "#/lib/types";

import { loadReplies, subscribeToReplies } from "./replies";

type Schemas = AdminSchemas["schemas"];

interface ReviewListEnvelope {
    data: Schemas["AdminReview"][];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

interface ProductRowEnvelope {
    data: { id: number; name: string; slug: string; translations?: { locale: string; name?: string; slug?: string }[] }[];
}

/**
 * Inputs accepted by {@link useReviewsList}.
 *
 * **Load-bearing constraint:** the reviews controller declares NO extras (`compileStrict()` with an
 * empty extras map) — it accepts ONLY the TableView grammar. So everything server-bound rides in
 * `query` as `filter[]` (status / rating / product_id / verified); `page` / `limit` ride too. The
 * remaining knobs are CLIENT-only and never reach the wire (sending them would 422):
 *
 * - `search` — multi-column free-text the API has no equivalent for (post-filter).
 * - `tab` — only carries the "All excludes trash" rule (status itself is filtered server-side via
 *   `query.filter[]=status:eq:…`); on the "All"/`any` tab the client hides trashed rows.
 * - sort — applied client-side because columns like `reviewer` / `product` are derived from a
 *   client lookup the server can't ORDER BY. `query.sort` is read here but NOT sent.
 */
export interface ReviewsListParams {
    query?: TableViewQuery;
    search?: string;
    tab?: ReviewStatus | "any";
}

/**
 * Subscribes to the client-side reply store so dependent queries re-run when the operator edits
 * a reply. (Replies are still local until the API ships a reply field; trash/spam are now real
 * server statuses.)
 */
function useClientReviewReplies(): Record<number, { body: string; updatedAt: string } | undefined> {
    const [replies, setReplies] = useState(() => loadReplies());
    useEffect(() => subscribeToReplies(() => setReplies(loadReplies())), []);
    return replies;
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
            const payload = await apiGet<ProductRowEnvelope>("products", { locale, query: { limit: 200 } });
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
 * Paginated admin reviews list. Status (`pending`/`approved`/`spam`/`trash`) is filtered
 * server-side via `query.filter[]=status:eq:…`; only free-text search and sort are client-side
 * (computed columns the server can't ORDER BY) — see {@link ReviewsListParams}.
 */
export function useReviewsList(params: ReviewsListParams = {}) {
    const locale = useLocale() as Locale;
    const query: TableViewQuery = params.query ?? { page: 1, limit: 20, filter: [], filterOr: [], sort: [] };
    const replies = useClientReviewReplies();
    const { data: productLookup } = useReviewProductLookup();

    /** Send filter[] + page + limit only — sort stays client-side (computed columns) and reviews
     *  has no extras to carry search/tab. */
    const sdkQuery = tableViewQueryToSdkQuery({ ...query, sort: [] });
    const sortSpec = sortSpecFromQuery(query);

    return useQuery<ReviewListEnvelope, Error, Paginated<AdminReview>>({
        queryKey: [
            "admin",
            "reviews",
            "list",
            {
                locale,
                sdkQuery,
                sortSpec,
                tab: params.tab,
                search: params.search ?? "",
            },
        ],
        queryFn: () => apiGet<ReviewListEnvelope>("reviews", { locale, query: sdkQuery }),
        placeholderData: keepPreviousData,
        select: (payload): Paginated<AdminReview> => {
            const ctx: AdapterContext = { products: productLookup, replies };
            const rowsAll = (payload.data ?? []).map((row) => toAdminReview(row, ctx));

            const tabFilter = (row: AdminReview): boolean => {
                /** Specific tabs are already narrowed server-side via `filter[]=status:eq:…`. Only
                 *  the "All" view applies the WordPress rule that hides trashed rows. */
                if (params.tab === undefined || params.tab === "any") return row.status !== "trash";
                return true;
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
            const sorted = sortReviews(filtered, sortSpec);
            const meta = payload.meta ?? { page: query.page, limit: query.limit, total: filtered.length, lastPage: 1 };
            return { data: sorted, meta };
        },
    });
}

/** Collapse the TableView sort array into the legacy `-field` / `field` spec the client sorter reads. */
function sortSpecFromQuery(query: TableViewQuery): string | undefined {
    const first = query.sort[0];
    if (first === undefined) return undefined;
    return first.dir === "desc" ? `-${first.field}` : first.field;
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
 * `?limit=1` request so flipping tabs reuses the count without a refetch. Every bucket — including
 * `spam` and `trash` — is a real server status query.
 */
export function useReviewCountsByStatus() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "review-counts", { locale }],
        queryFn: async (): Promise<Partial<Record<"any" | ReviewStatus, number>>> => {
            const fetchTotal = async (statusFilter?: string): Promise<number | undefined> => {
                try {
                    const payload = await apiGet<ReviewListEnvelope>("reviews", {
                        locale,
                        query: {
                            limit: 1,
                            ...(statusFilter !== undefined ? { "filter[]": statusFilter } : {}),
                        },
                    });
                    return payload.meta?.total ?? payload.data?.length ?? 0;
                } catch {
                    return undefined;
                }
            };
            /** "All" follows the WordPress rule and excludes trash; the rest are exact statuses. */
            const [any, pending, approved, spam, trash] = await Promise.all([
                fetchTotal("status:neq:trash"),
                fetchTotal("status:eq:pending"),
                fetchTotal("status:eq:approved"),
                fetchTotal("status:eq:spam"),
                fetchTotal("status:eq:trash"),
            ]);
            return { any, pending, approved, spam, trash };
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
