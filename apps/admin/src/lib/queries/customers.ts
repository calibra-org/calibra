"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import {
    toAdminCustomer,
    toAdminCustomerCounts,
    toAdminCustomerMarketingHistory,
    toAdminCustomerMarketingPrefs,
    toAdminCustomerNote,
    toAdminCustomerSegment,
    toAdminCustomerStats,
    toAdminCustomerStatusHistory,
    toAdminCustomerTag,
    toAdminCustomerTimeline,
} from "#/lib/adapters/customers";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { serializeTableViewQuery, type TableViewQuery } from "#/lib/table-view";
import type {
    AdminCustomer,
    AdminCustomerCounts,
    AdminCustomerMarketingHistory,
    AdminCustomerMarketingPrefs,
    AdminCustomerNote,
    AdminCustomerSegment,
    AdminCustomerStatsDetail,
    AdminCustomerStatusHistory,
    AdminCustomerTagRow,
    AdminCustomerTimelineEntry,
    Paginated,
} from "#/lib/types";

export type CustomerTabKey = "any" | "account" | "guest" | "big" | "new" | "inactive" | "no_address" | "trashed";

/**
 * Inputs accepted by {@link useCustomersList}. `query` carries the unified TableView grammar
 * (filter / filterOr / sort / page / limit). Every other field is an endpoint extension that
 * doesn't fit the TableView surface: tab-strip scopes, free-text search across many columns,
 * join-traversing facets (tags/cities), aggregate-based filters (with_orders, order_count_*,
 * lifetime_spend_*, aov_*), and the `include_stats` response-shape flag.
 */
export interface CustomersListParams {
    query?: TableViewQuery;
    q?: string;
    tab?: CustomerTabKey;
    includeStats?: boolean;
    cities?: string[];
    tags?: string[];
    optInEmail?: boolean;
    optInSms?: boolean;
    /** Inclusive ISO date-time bounds for the customer's most-recent counted order. The
     * picker primitive computes these via {@link dateFilterValueToTableViewFilter}. */
    lastOrderAfter?: string;
    lastOrderBefore?: string;
    hasNationalId?: boolean;
    withOrders?: boolean;
    noOrders?: boolean;
}

interface ListEnvelope {
    data: Parameters<typeof toAdminCustomer>[0][];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

function buildQueryRecord(entries: Array<[string, string]>): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    for (const [k, v] of entries) {
        const existing = out[k];
        if (existing === undefined) out[k] = v;
        else if (Array.isArray(existing)) existing.push(v);
        else out[k] = [existing, v];
    }
    return out;
}

export function useCustomersList(params: CustomersListParams = {}) {
    const locale = useLocale() as Locale;
    const includeStats = params.includeStats ?? true;
    const query: TableViewQuery =
        params.query ?? { page: 1, limit: 20, filter: [], filterOr: [], sort: [] };
    const serialised = serializeTableViewQuery(query);
    const csv = (arr?: string[]) => (arr && arr.length > 0 ? arr.join(",") : undefined);
    return useQuery<ListEnvelope, Error, Paginated<AdminCustomer>>({
        queryKey: [
            "admin",
            "customers",
            "list",
            {
                locale,
                serialised,
                q: params.q,
                tab: params.tab,
                includeStats,
                cities: csv(params.cities),
                tags: csv(params.tags),
                optInEmail: params.optInEmail,
                optInSms: params.optInSms,
                lastOrderAfter: params.lastOrderAfter,
                lastOrderBefore: params.lastOrderBefore,
                hasNationalId: params.hasNationalId,
                withOrders: params.withOrders,
                noOrders: params.noOrders,
            },
        ],
        queryFn: () =>
            apiGet<ListEnvelope>("customers", {
                locale,
                query: {
                    ...buildQueryRecord(serialised),
                    q: params.q,
                    tab: params.tab,
                    include_stats: includeStats,
                    cities: csv(params.cities),
                    tags: csv(params.tags),
                    opt_in_email: params.optInEmail,
                    opt_in_sms: params.optInSms,
                    last_order_after: params.lastOrderAfter,
                    last_order_before: params.lastOrderBefore,
                    has_national_id: params.hasNationalId,
                    with_orders: params.withOrders,
                    no_orders: params.noOrders,
                },
            }),
        select: (payload) => ({
            data: (payload.data ?? []).map(toAdminCustomer),
            meta: payload.meta ?? {
                page: query.page,
                limit: query.limit,
                total: payload.data?.length ?? 0,
                lastPage: 1,
            },
        }),
    });
}

export function useCustomer(id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomer>[0] }, Error, AdminCustomer | null>({
        queryKey: ["admin", "customers", "detail", { locale, id }],
        queryFn: () => apiGet(`customers/${id}`, { locale }),
        select: (payload) => (payload.data ? toAdminCustomer(payload.data) : null),
        enabled: id !== null && id > 0,
    });
}

export function useCustomerCounts() {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerCounts>[0] }, Error, AdminCustomerCounts>({
        queryKey: ["admin", "customers", "counts", { locale }],
        queryFn: () => apiGet("customers/counts", { locale }),
        select: (payload) => toAdminCustomerCounts(payload.data),
        refetchInterval: 30_000,
    });
}

export function useCustomerStats(id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerStats>[0] }, Error, AdminCustomerStatsDetail>({
        queryKey: ["admin", "customers", "stats", { locale, id }],
        queryFn: () => apiGet(`customers/${id}/stats`, { locale }),
        select: (payload) => toAdminCustomerStats(payload.data),
        enabled: id !== null && id > 0,
        staleTime: 60_000,
    });
}

export function useCustomerNotes(customerId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerNote>[0][] }, Error, AdminCustomerNote[]>({
        queryKey: ["admin", "customers", "notes", { locale, customerId }],
        queryFn: () => apiGet(`customers/${customerId}/notes`, { locale }),
        select: (payload) => payload.data.map(toAdminCustomerNote),
        enabled: customerId !== null && customerId > 0,
    });
}

export function useAddCustomerNote(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: string) =>
            apiMutate<{ data: Parameters<typeof toAdminCustomerNote>[0] }>("POST", `customers/${customerId}/notes`, {
                locale,
                body: { body },
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "notes", { locale, customerId }] });
        },
    });
}

export function useUpdateCustomerNote(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, body }: { id: number; body: string }) =>
            apiMutate("PATCH", `customers/${customerId}/notes/${id}`, { locale, body: { body } }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "notes", { locale, customerId }] });
        },
    });
}

export function useDeleteCustomerNote(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate("DELETE", `customers/${customerId}/notes/${id}`, { locale }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "notes", { locale, customerId }] });
        },
    });
}

export function useCustomerTagSuggestions(q: string) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerTag>[0][] }, Error, AdminCustomerTagRow[]>({
        queryKey: ["admin", "customer-tags", { locale, q }],
        queryFn: () => apiGet("customer-tags", { locale, query: { q, limit: 50 } }),
        select: (payload) => payload.data.map(toAdminCustomerTag),
    });
}

export function useAttachCustomerTag(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (tag: string) =>
            apiMutate<{ data: Parameters<typeof toAdminCustomerTag>[0] }>("POST", `customers/${customerId}/tags`, {
                locale,
                body: { tag },
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "detail", { locale, id: customerId }] });
        },
    });
}

export function useDetachCustomerTag(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (tagId: number) => apiMutate("DELETE", `customers/${customerId}/tags/${tagId}`, { locale }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "detail", { locale, id: customerId }] });
        },
    });
}

export function useCustomerSegments() {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerSegment>[0][] }, Error, AdminCustomerSegment[]>({
        queryKey: ["admin", "customer-segments", { locale }],
        queryFn: () => apiGet("customer-segments", { locale }),
        select: (payload) => payload.data.map(toAdminCustomerSegment),
    });
}

export function useCreateCustomerSegment() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { name: string; filters: Record<string, unknown>; is_pinned?: boolean }) =>
            apiMutate<{ data: Parameters<typeof toAdminCustomerSegment>[0] }>("POST", "customer-segments", {
                locale,
                body: input,
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customer-segments", { locale }] }),
    });
}

export function useUpdateCustomerSegment() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...input }: { id: number; name: string; filters: Record<string, unknown>; is_pinned?: boolean }) =>
            apiMutate<{ data: Parameters<typeof toAdminCustomerSegment>[0] }>("PATCH", `customer-segments/${id}`, {
                locale,
                body: input,
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customer-segments", { locale }] }),
    });
}

export function useDeleteCustomerSegment() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate("DELETE", `customer-segments/${id}`, { locale }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customer-segments", { locale }] }),
    });
}

export function useCustomerMarketingPrefs(customerId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerMarketingPrefs>[0] }, Error, AdminCustomerMarketingPrefs>({
        queryKey: ["admin", "customers", "marketing", { locale, customerId }],
        queryFn: () => apiGet(`customers/${customerId}/marketing`, { locale }),
        select: (payload) => toAdminCustomerMarketingPrefs(payload.data),
        enabled: customerId !== null && customerId > 0,
    });
}

export function useUpdateCustomerMarketingPref(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { channel: "email" | "sms" | "phone"; opt_in: boolean; source?: string }) =>
            apiMutate<{ data: Parameters<typeof toAdminCustomerMarketingPrefs>[0] }>(
                "PATCH",
                `customers/${customerId}/marketing`,
                { locale, body: input },
            ),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "marketing", { locale, customerId }] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "marketing-history", { locale, customerId }] });
        },
    });
}

export function useCustomerMarketingHistory(customerId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerMarketingHistory>[0][] }, Error, AdminCustomerMarketingHistory[]>({
        queryKey: ["admin", "customers", "marketing-history", { locale, customerId }],
        queryFn: () => apiGet(`customers/${customerId}/marketing/history`, { locale }),
        select: (payload) => payload.data.map(toAdminCustomerMarketingHistory),
        enabled: customerId !== null && customerId > 0,
    });
}

export function useUpdateCustomerStatus(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ status, reason, force }: { status: "active" | "suspended"; reason?: string; force?: boolean }) =>
            apiMutate("PATCH", `customers/${customerId}/status`, {
                locale,
                body: { status, reason },
                query: force === true ? { force: "1" } : undefined,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "detail", { locale, id: customerId }] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}

/**
 * Row-level status mutation for the list page where the id is only known per row. Same wire
 * shape as {@link useUpdateCustomerStatus} but the id comes through the mutation arg, so the
 * hook stays unconditional at the top of the component (rules-of-hooks).
 */
export function useBulkRowStatusMutation() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            customerId,
            status,
            reason,
            force,
        }: {
            customerId: number;
            status: "active" | "suspended";
            reason?: string;
            force?: boolean;
        }) =>
            apiMutate("PATCH", `customers/${customerId}/status`, {
                locale,
                body: { status, reason },
                query: force === true ? { force: "1" } : undefined,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}

/** Row-level password reset trigger — mirrors {@link useSendPasswordReset} with id in the mutation arg. */
export function useBulkRowPasswordResetMutation() {
    const locale = useLocale() as Locale;
    return useMutation({
        mutationFn: (customerId: number) => apiMutate("POST", `customers/${customerId}/send-password-reset`, { locale }),
    });
}

export function useCustomerStatusHistory(customerId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: Parameters<typeof toAdminCustomerStatusHistory>[0][] }, Error, AdminCustomerStatusHistory[]>({
        queryKey: ["admin", "customers", "status-history", { locale, customerId }],
        queryFn: () => apiGet(`customers/${customerId}/status-history`, { locale }),
        select: (payload) => payload.data.map(toAdminCustomerStatusHistory),
        enabled: customerId !== null && customerId > 0,
    });
}

export function useCustomerTimeline(customerId: number | null, types: string[] = []) {
    const locale = useLocale() as Locale;
    const typesParam = types.length > 0 ? types.join(",") : undefined;
    return useQuery<{ data: Array<Parameters<typeof toAdminCustomerTimeline>[0][number]> }, Error, AdminCustomerTimelineEntry[]>({
        queryKey: ["admin", "customers", "timeline", { locale, customerId, typesParam }],
        queryFn: () => apiGet(`customers/${customerId}/timeline`, { locale, query: { types: typesParam, limit: 100 } }),
        select: (payload) => toAdminCustomerTimeline(payload.data),
        enabled: customerId !== null && customerId > 0,
    });
}

export function useConvertCustomerToAccount(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { email: string; password?: string; send_password_reset_email?: boolean }) =>
            apiMutate("POST", `customers/${customerId}/convert-to-account`, { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "detail", { locale, id: customerId }] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
        },
    });
}

export function useSendPasswordReset(customerId: number) {
    const locale = useLocale() as Locale;
    return useMutation({
        mutationFn: () => apiMutate("POST", `customers/${customerId}/send-password-reset`, { locale }),
    });
}

export function useImpersonateCustomer(customerId: number) {
    const locale = useLocale() as Locale;
    return useMutation({
        mutationFn: () =>
            apiMutate<{
                data: {
                    token: string;
                    token_query_param: string;
                    expires_at: string;
                    impersonator_id: string;
                    customer_id: string;
                    event_id: string;
                };
            }>("POST", `customers/${customerId}/impersonate`, { locale }),
    });
}

export function useMergeCustomers() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            primary_id: number;
            duplicate_ids: number[];
            strategy?: { addresses?: string; tags?: string; marketing_prefs?: string };
        }) => apiMutate("POST", "customers/merge", { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}

export interface NewCustomerInput {
    first_name: string;
    last_name: string;
    email?: string;
    password?: string;
    phone?: string | null;
    country_default?: string;
    acquisition_channel?: string;
}

export function useCreateCustomer() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: NewCustomerInput) =>
            apiMutate<{ data: Parameters<typeof toAdminCustomer>[0] }>("POST", "customers", { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}

export function useUpdateCustomer(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: Partial<Pick<NewCustomerInput, "first_name" | "last_name" | "phone" | "country_default">>) =>
            apiMutate("PATCH", `customers/${customerId}`, { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers", "detail", { locale, id: customerId }] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
        },
    });
}

export function useDeleteCustomer() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate("DELETE", `customers/${id}`, { locale }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}

export function useRestoreCustomer() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate("POST", `customers/${id}/restore`, { locale }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}

export function useBulkCustomerAction() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            tag_add?: string[];
            tag_remove?: string[];
            status_change?: "active" | "suspended";
            delete?: number[];
        }) => apiMutate("POST", "customers/batch", { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customers"] });
            qc.invalidateQueries({ queryKey: ["admin", "customers", "counts"] });
        },
    });
}
