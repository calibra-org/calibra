"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect } from "react";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { type TableViewQuery, tableViewQueryToSdkQuery } from "#/lib/table-view";
import { getTransmit } from "#/lib/transmit";

/**
 * Ticketing query + mutation hooks shared across the inbox list, the conversation detail surface,
 * and the support settings screens. Every hook reads `useLocale()` so the same-origin admin proxy
 * forwards `Accept-Language` to the AdonisJS origin, and folds the locale into its query key so a
 * locale switch never serves a stale-language cache entry.
 *
 * List endpoints return `{ data: T[]; meta }`; single endpoints return `{ data: T }`. Paths are
 * relative to `/api/admin` (e.g. `tickets` → `/api/v1/admin/tickets`). Mutations invalidate the
 * `["admin","tickets"]` root (and the specific detail key) so every dependent view refetches.
 */

export type TicketConversation = AdminSchemas["schemas"]["TicketConversation"];
export type TicketConversationDetail = AdminSchemas["schemas"]["TicketConversationDetail"];
export type TicketMessage = AdminSchemas["schemas"]["TicketMessage"];
export type TicketAgent = AdminSchemas["schemas"]["TicketAgent"];
export type TicketCannedResponse = AdminSchemas["schemas"]["TicketCannedResponse"];
export type TicketTag = AdminSchemas["schemas"]["TicketTag"];
export type TicketInbox = AdminSchemas["schemas"]["TicketInbox"];
export type ChannelConnection = AdminSchemas["schemas"]["ChannelConnection"];

/** Status-tab scopes the inbox toolbar exposes. `all` drops the status filter entirely. */
export type TicketTab = "all" | "open" | "pending" | "snoozed" | "resolved" | "closed" | "archived";

/** Pagination envelope shared by every ticketing list endpoint. */
export interface TicketListMeta {
    page: number;
    limit: number;
    total: number;
    lastPage: number;
}

interface ListEnvelope<T> {
    data: T[];
    meta?: TicketListMeta;
}

/**
 * Inputs accepted by {@link useTicketsList}. `query` carries the unified TableView grammar
 * (filter / filterOr / sort / page / limit); `q` is the free-text search across requester +
 * subject + body; `tab` is the status-strip scope. Both extras ride on the wire under their
 * literal keys so the URL, the params object, and the request all read identically.
 */
export interface TicketsListParams {
    query?: TableViewQuery;
    q?: string;
    tab?: TicketTab;
}

const DEFAULT_QUERY: TableViewQuery = { page: 1, limit: 20, filter: [], filterOr: [], sort: [] };

export function useTicketsList(
    params: TicketsListParams = {},
): UseQueryResult<{ data: TicketConversation[]; meta: TicketListMeta }> {
    const locale = useLocale() as Locale;
    const query = params.query ?? DEFAULT_QUERY;
    const tab = params.tab ?? "all";
    const sdkQuery = tableViewQueryToSdkQuery(query, {
        q: params.q,
        tab: tab === "all" ? undefined : tab,
    });
    return useQuery<ListEnvelope<TicketConversation>, Error, { data: TicketConversation[]; meta: TicketListMeta }>({
        queryKey: ["admin", "tickets", "list", { locale, sdkQuery }],
        queryFn: ({ signal }) => apiGet<ListEnvelope<TicketConversation>>("tickets", { locale, query: sdkQuery, signal }),
        select: (payload) => ({
            data: payload.data ?? [],
            meta: payload.meta ?? {
                page: query.page,
                limit: query.limit,
                total: payload.data?.length ?? 0,
                lastPage: 1,
            },
        }),
    });
}

export function useTicket(id: string | number | null | undefined): UseQueryResult<TicketConversationDetail> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: TicketConversationDetail }, Error, TicketConversationDetail>({
        queryKey: ["admin", "tickets", "detail", { locale, id: String(id ?? "") }],
        queryFn: ({ signal }) => apiGet<{ data: TicketConversationDetail }>(`tickets/${id}`, { locale, signal }),
        select: (payload) => payload.data,
        enabled: id !== null && id !== undefined && String(id).length > 0,
    });
}

/** Body shape for {@link usePostTicketMessage}. `is_note` flips the entry to an internal note. */
export interface PostTicketMessageInput {
    body?: string;
    is_note?: boolean;
    content_type?: string;
    attachment_media_ids?: number[];
}

export function usePostTicketMessage(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: PostTicketMessageInput) =>
            apiMutate<{ data: TicketMessage }>("POST", `tickets/${id}/messages`, { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "detail", { locale, id: String(id) }] });
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "list"] });
        },
    });
}

/** Body shape for {@link useUpdateTicket}. Every field is optional — PATCH only the dimensions that moved. */
export interface UpdateTicketInput {
    status?: string;
    priority?: string;
    assignee_agent_id?: number | string | null;
    snoozed_until?: string;
}

export function useUpdateTicket(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: UpdateTicketInput) =>
            apiMutate<{ data: TicketConversation }>("PATCH", `tickets/${id}`, { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "detail", { locale, id: String(id) }] });
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "list"] });
        },
    });
}

export function useAddTicketTag(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (tag: string) => apiMutate<{ data: TicketTag }>("POST", `tickets/${id}/tags`, { locale, body: { tag } }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "detail", { locale, id: String(id) }] });
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "list"] });
        },
    });
}

export function useRemoveTicketTag(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (tagId: string | number) => apiMutate("DELETE", `tickets/${id}/tags/${tagId}`, { locale }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "detail", { locale, id: String(id) }] });
            qc.invalidateQueries({ queryKey: ["admin", "tickets", "list"] });
        },
    });
}

export function useInboxes(): UseQueryResult<TicketInbox[]> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: TicketInbox[] }, Error, TicketInbox[]>({
        queryKey: ["admin", "tickets", "inboxes", { locale }],
        queryFn: ({ signal }) => apiGet<{ data: TicketInbox[] }>("tickets/inboxes", { locale, signal }),
        select: (payload) => payload.data ?? [],
    });
}

export function useTicketAgents(): UseQueryResult<TicketAgent[]> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: TicketAgent[] }, Error, TicketAgent[]>({
        queryKey: ["admin", "tickets", "agents", { locale }],
        queryFn: ({ signal }) => apiGet<{ data: TicketAgent[] }>("tickets/agents", { locale, signal }),
        select: (payload) => payload.data ?? [],
    });
}

/** Body shape for {@link useCreateTicketAgent} / {@link useUpdateTicketAgent}. */
export interface TicketAgentInput {
    user_id?: number | string;
    support_role?: string;
    access_tier?: string;
    can_reassign?: boolean;
    max_open_capacity?: number | null;
    status?: string;
}

export function useCreateTicketAgent() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: TicketAgentInput) =>
            apiMutate<{ data: TicketAgent }>("POST", "tickets/agents", { locale, body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "agents", { locale }] }),
    });
}

export function useUpdateTicketAgent(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: TicketAgentInput) =>
            apiMutate<{ data: TicketAgent }>("PATCH", `tickets/agents/${id}`, { locale, body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "agents", { locale }] }),
    });
}

export function useCannedResponses(): UseQueryResult<TicketCannedResponse[]> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: TicketCannedResponse[] }, Error, TicketCannedResponse[]>({
        queryKey: ["admin", "tickets", "canned", { locale }],
        queryFn: ({ signal }) => apiGet<{ data: TicketCannedResponse[] }>("tickets/canned", { locale, signal }),
        select: (payload) => payload.data ?? [],
    });
}

/** Body shape for {@link useCreateCanned} / {@link useUpdateCanned}. */
export interface CannedResponseInput {
    shortcut: string;
    title: string;
    body: string;
}

export function useCreateCanned() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CannedResponseInput) =>
            apiMutate<{ data: TicketCannedResponse }>("POST", "tickets/canned", { locale, body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "canned", { locale }] }),
    });
}

export function useUpdateCanned(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: Partial<CannedResponseInput>) =>
            apiMutate<{ data: TicketCannedResponse }>("PATCH", `tickets/canned/${id}`, { locale, body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "canned", { locale }] }),
    });
}

export function useTicketTags(): UseQueryResult<TicketTag[]> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: TicketTag[] }, Error, TicketTag[]>({
        queryKey: ["admin", "tickets", "tags", { locale }],
        queryFn: ({ signal }) => apiGet<{ data: TicketTag[] }>("tickets/tags", { locale, signal }),
        select: (payload) => payload.data ?? [],
    });
}

/** Body shape for {@link useCreateTicketTag}. */
export interface TicketTagInput {
    name: string;
    color?: string | null;
}

export function useCreateTicketTag() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: TicketTagInput) => apiMutate<{ data: TicketTag }>("POST", "tickets/tags", { locale, body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "tags", { locale }] }),
    });
}

/**
 * Delete a ticket tag. Accepts the id either bound at hook-call time (`useDeleteTicketTag(id)`)
 * or per-call through `mutate(id)` — the mutation arg wins when both are supplied, so a tag-list
 * manager can call the hook once and delete any row.
 */
export function useDeleteTicketTag(boundId?: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id?: string | number) => apiMutate("DELETE", `tickets/tags/${id ?? boundId}`, { locale }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "tickets", "tags", { locale }] }),
    });
}

/**
 * Support family — the operator-as-requester surface. Mirrors the ticketing endpoints but rooted
 * at `support` (the current user opens / reads / replies to their own support threads). Keyed
 * separately under `["admin","support"]` so the inbox cache and the support cache never collide.
 */

export function useSupportTickets(): UseQueryResult<{ data: TicketConversation[]; meta: TicketListMeta }> {
    const locale = useLocale() as Locale;
    return useQuery<ListEnvelope<TicketConversation>, Error, { data: TicketConversation[]; meta: TicketListMeta }>({
        queryKey: ["admin", "support", "list", { locale }],
        queryFn: ({ signal }) => apiGet<ListEnvelope<TicketConversation>>("support", { locale, signal }),
        select: (payload) => ({
            data: payload.data ?? [],
            meta: payload.meta ?? { page: 1, limit: 20, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
    });
}

/** Body shape for {@link useOpenSupportTicket}. */
export interface OpenSupportTicketInput {
    subject: string;
    body: string;
    priority?: string;
}

export function useOpenSupportTicket() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: OpenSupportTicketInput) =>
            apiMutate<{ data: TicketConversationDetail }>("POST", "support", { locale, body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "support", "list"] }),
    });
}

export function useSupportTicket(id: string | number | null | undefined): UseQueryResult<TicketConversationDetail> {
    const locale = useLocale() as Locale;
    return useQuery<{ data: TicketConversationDetail }, Error, TicketConversationDetail>({
        queryKey: ["admin", "support", "detail", { locale, id: String(id ?? "") }],
        queryFn: ({ signal }) => apiGet<{ data: TicketConversationDetail }>(`support/${id}`, { locale, signal }),
        select: (payload) => payload.data,
        enabled: id !== null && id !== undefined && String(id).length > 0,
    });
}

export function usePostSupportMessage(id: string | number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: PostTicketMessageInput) =>
            apiMutate<{ data: TicketMessage }>("POST", `support/${id}/messages`, { locale, body: input }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "support", "detail", { locale, id: String(id) }] });
            qc.invalidateQueries({ queryKey: ["admin", "support", "list"] });
        },
    });
}

/**
 * Subscribe to the live SSE feed for one conversation. New messages, status flips, and typing
 * activity arrive over `ticketing/conversations/${id}` and are handed to `onEvent`. The effect
 * registers a Transmit subscription, creates the SSE channel, and tears both down on unmount or
 * id change. SSE failures are swallowed — the detail view still works via query invalidation +
 * manual refetch, so a missing Transmit server degrades gracefully rather than throwing in render.
 */
export function useTicketStream(id: string | number | null | undefined, onEvent: (event: unknown) => void): void {
    useEffect(() => {
        if (id === null || id === undefined || String(id).length === 0) return;
        let alive = true;
        let off: (() => void) | undefined;
        let teardown: (() => void) | undefined;
        try {
            const subscription = getTransmit().subscription(`ticketing/conversations/${id}`);
            off = subscription.onMessage<unknown>((event) => {
                if (alive) onEvent(event);
            });
            void subscription.create().catch(() => {
                /** Channel create failed (no SSE server) — fall back to query refetch silently. */
            });
            teardown = () => {
                off?.();
                void subscription.delete().catch(() => undefined);
            };
        } catch {
            /** Transmit unavailable (SSR, no SSE server) — degrade silently. */
            return;
        }
        return () => {
            alive = false;
            try {
                teardown?.();
            } catch {
                /** Best-effort teardown — never throw from a cleanup. */
            }
        };
    }, [id, onEvent]);
}
