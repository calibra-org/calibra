"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

import type {
    ContentAgentKind,
    ContentAgentRun,
    ContentCategory,
    ContentPost,
    ContentPostInput,
    ContentSettings,
    ContentSignal,
    ContentSource,
    ContentSummary,
    ContentTag,
    Paginated,
    ResourceResponse,
} from "./types";

const root = ["content"] as const;

export function useContentSummary() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "summary", locale],
        queryFn: ({ signal }) => apiGet<ResourceResponse<ContentSummary>>("content/summary", { locale, signal }),
    });
}

export function useContentPosts(filters: Record<string, string | number | undefined>) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "posts", locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<ContentPost>>("content/posts", { locale, query: filters, signal }),
    });
}

export function useContentPost(id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "post", id, locale],
        queryFn: ({ signal }) => apiGet<ResourceResponse<ContentPost>>(`content/posts/${id}`, { locale, signal }),
        enabled: id !== null,
    });
}

export function useCreateContentPost() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: ContentPostInput) =>
            apiMutate<ResourceResponse<ContentPost>>("POST", "content/posts", { locale, body }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: root });
        },
    });
}

export function useUpdateContentPost(id: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: ContentPostInput & { expected_version: number }) =>
            apiMutate<ResourceResponse<ContentPost>>("PATCH", `content/posts/${id}`, {
                locale,
                body,
                ifMatch: String(body.expected_version),
            }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: root });
        },
    });
}

export function useTransitionContentPost(id: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            to_status: string;
            expected_version: number;
            scheduled_at?: string | null;
            reason?: string | null;
        }) =>
            apiMutate<ResourceResponse<ContentPost>>("POST", `content/posts/${id}/transition`, {
                locale,
                body,
                ifMatch: String(body.expected_version),
            }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: root });
        },
    });
}

export function useContentAttributionMutations(id: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    const invalidate = async () => {
        await qc.invalidateQueries({ queryKey: root });
    };
    return {
        add: useMutation({
            mutationFn: (body: { order_id: number; product_id?: number | null; note?: string | null }) =>
                apiMutate<ResourceResponse<ContentPost>>("POST", `content/posts/${id}/attributions`, { locale, body }),
            onSuccess: invalidate,
        }),
        remove: useMutation({
            mutationFn: (orderId: number) =>
                apiMutate<ResourceResponse<ContentPost>>("DELETE", `content/posts/${id}/attributions/${orderId}`, { locale }),
            onSuccess: invalidate,
        }),
    };
}

export function useDeleteContentPost(id: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (version: number) => apiMutate<void>("DELETE", `content/posts/${id}`, { locale, ifMatch: String(version) }),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: root });
        },
    });
}

export function useContentTaxonomy() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "taxonomy", locale],
        queryFn: ({ signal }) =>
            apiGet<ResourceResponse<{ categories: ContentCategory[]; tags: ContentTag[] }>>("content/taxonomy", {
                locale,
                signal,
            }),
    });
}

export function useTaxonomyMutation() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return {
        create: useMutation({
            mutationFn: (body: Record<string, unknown>) => apiMutate("POST", "content/taxonomy", { locale, body }),
            onSuccess: async () => qc.invalidateQueries({ queryKey: [...root, "taxonomy"] }),
        }),
        update: useMutation({
            mutationFn: ({ id, ...body }: Record<string, unknown> & { id: number }) =>
                apiMutate("PATCH", `content/taxonomy/${id}`, { locale, body }),
            onSuccess: async () => qc.invalidateQueries({ queryKey: [...root, "taxonomy"] }),
        }),
        remove: useMutation({
            mutationFn: ({ id, kind }: { id: number; kind: "category" | "tag" }) =>
                apiMutate("DELETE", `content/taxonomy/${id}`, { locale, query: { kind } }),
            onSuccess: async () => qc.invalidateQueries({ queryKey: [...root, "taxonomy"] }),
        }),
    };
}

export function useContentSignals(filters: Record<string, string | number | undefined> = {}) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "signals", locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<ContentSignal>>("content/signals", { locale, query: filters, signal }),
    });
}

export function useContentSources() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "sources", locale],
        queryFn: ({ signal }) => apiGet<ResourceResponse<ContentSource[]>>("content/sources", { locale, signal }),
    });
}

export function useMarketMutations() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    const invalidate = async () => qc.invalidateQueries({ queryKey: root });
    return {
        createSignal: useMutation({
            mutationFn: (body: Record<string, unknown>) => apiMutate("POST", "content/signals", { locale, body }),
            onSuccess: invalidate,
        }),
        signalStatus: useMutation({
            mutationFn: ({ id, status }: { id: number; status: "reviewed" | "ignored" }) =>
                apiMutate("PATCH", `content/signals/${id}/status`, { locale, body: { status } }),
            onSuccess: invalidate,
        }),
        convertSignal: useMutation({
            mutationFn: (id: number) =>
                apiMutate<ResourceResponse<ContentPost>>("POST", `content/signals/${id}/convert`, { locale }),
            onSuccess: invalidate,
        }),
        createSource: useMutation({
            mutationFn: (body: Record<string, unknown>) => apiMutate("POST", "content/sources", { locale, body }),
            onSuccess: invalidate,
        }),
        updateSource: useMutation({
            mutationFn: ({ id, ...body }: Record<string, unknown> & { id: number }) =>
                apiMutate("PATCH", `content/sources/${id}`, { locale, body }),
            onSuccess: invalidate,
        }),
        removeSource: useMutation({
            mutationFn: (id: number) => apiMutate("DELETE", `content/sources/${id}`, { locale }),
            onSuccess: invalidate,
        }),
        ingestSource: useMutation({
            mutationFn: (id: number) => apiMutate("POST", `content/sources/${id}/ingest`, { locale }),
            onSuccess: invalidate,
        }),
    };
}

export function useContentAgents(filters: Record<string, string | number | undefined> = {}) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "agents", locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<ContentAgentRun>>("content/agents", { locale, query: filters, signal }),
        refetchInterval: (query) =>
            query.state.data?.data.some((run) => run.status === "queued" || run.status === "running") ? 2500 : false,
    });
}

export function useAgentMutations() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    const invalidate = async () => qc.invalidateQueries({ queryKey: [...root, "agents"] });
    return {
        run: useMutation({
            mutationFn: (body: {
                agent_kind: ContentAgentKind;
                instruction: string;
                post_id?: number | null;
                signal_id?: number | null;
                use_web_search?: boolean;
            }) => apiMutate<ResourceResponse<ContentAgentRun>>("POST", "content/agents/run", { locale, body }),
            onSuccess: invalidate,
        }),
        review: useMutation({
            mutationFn: ({ id, decision, note }: { id: number; decision: "approved" | "rejected"; note?: string }) =>
                apiMutate("POST", `content/agents/${id}/review`, { locale, body: { decision, note } }),
            onSuccess: invalidate,
        }),
        apply: useMutation({
            mutationFn: (id: number) =>
                apiMutate<{ data: ContentAgentRun; post: ContentPost }>("POST", `content/agents/${id}/apply`, { locale }),
            onSuccess: async () => {
                await qc.invalidateQueries({ queryKey: root });
            },
        }),
    };
}

export function useContentCalendar(from?: string, to?: string) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "calendar", locale, from, to],
        queryFn: ({ signal }) =>
            apiGet<
                ResourceResponse<
                    Array<
                        Pick<
                            ContentPost,
                            | "id"
                            | "title"
                            | "type"
                            | "status"
                            | "scheduled_at"
                            | "published_at"
                            | "author_user_id"
                            | "seo_score"
                            | "quality_score"
                        >
                    >
                >
            >("content/calendar", { locale, query: { from, to }, signal }),
    });
}

export function useContentReports() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "reports", locale],
        queryFn: ({ signal }) => apiGet<ResourceResponse<Record<string, unknown>>>("content/reports", { locale, signal }),
    });
}

export function useContentSettings() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "settings", locale],
        queryFn: ({ signal }) => apiGet<ResourceResponse<ContentSettings>>("content/settings", { locale, signal }),
    });
}

export function useUpdateContentSettings() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Partial<ContentSettings>) =>
            apiMutate<ResourceResponse<ContentSettings>>("PATCH", "content/settings", { locale, body }),
        onSuccess: async () => qc.invalidateQueries({ queryKey: [...root, "settings"] }),
    });
}

export function useContentResources<T>(kind: "products" | "orders" | "users" | "media", q = "", enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "resources", kind, locale, q],
        queryFn: ({ signal }) =>
            apiGet<ResourceResponse<T[]>>("content/resources", { locale, query: { kind, q, limit: 30 }, signal }),
        enabled,
    });
}
