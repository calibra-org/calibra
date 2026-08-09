"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

import type {
    Paginated,
    Resource,
    SeoCompetitor,
    SeoEntity,
    SeoEntityDetail,
    SeoEntityKind,
    SeoIntegration,
    SeoInternalLink,
    SeoIssue,
    SeoIssueStatus,
    SeoKeyword,
    SeoOverview,
    SeoProfile,
    SeoRedirect,
    SeoReport,
    SeoSettings,
} from "./types";

const root = ["seo"] as const;

export function useSeoOverview() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "overview", locale],
        queryFn: ({ signal }) => apiGet<Resource<SeoOverview>>("seo/overview", { locale, signal }),
    });
}

export function useSeoReports() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "reports", locale],
        queryFn: ({ signal }) => apiGet<Resource<SeoReport>>("seo/reports", { locale, signal }),
    });
}

export function useSeoEntities(filters: Record<string, string | number | boolean | undefined>) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "entities", locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<SeoEntity>>("seo/entities", { locale, query: filters, signal }),
    });
}

export function useSeoEntity(kind: SeoEntityKind | null, id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "entity", kind, id, locale],
        queryFn: ({ signal }) => apiGet<Resource<SeoEntityDetail>>(`seo/entities/${kind}/${id}`, { locale, signal }),
        enabled: kind !== null && id !== null,
    });
}

export function useSeoProfileMutation(kind: SeoEntityKind, id: number) {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: Partial<SeoProfile> & { expected_version?: number }) =>
            apiMutate<Resource<SeoEntityDetail>>("PATCH", `seo/entities/${kind}/${id}/profile`, { locale, body }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: root }),
    });
}

export function useSeoAuditMutation() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    const invalidate = async () => queryClient.invalidateQueries({ queryKey: root });
    return {
        all: useMutation({
            mutationFn: (body: { kinds?: SeoEntityKind[]; locale?: "fa" | "en"; engine_profile?: "k20" | "k21" }) =>
                apiMutate("POST", "seo/audits", { locale, body }),
            onSuccess: invalidate,
        }),
        entity: useMutation({
            mutationFn: ({ kind, id }: { kind: SeoEntityKind; id: number }) =>
                apiMutate("POST", `seo/entities/${kind}/${id}/audit`, { locale }),
            onSuccess: invalidate,
        }),
    };
}

export function useSeoIssues(filters: Record<string, string | number | undefined> = {}) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "issues", locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<SeoIssue>>("seo/issues", { locale, query: filters, signal }),
    });
}

export function useSeoIssueStatusMutation() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }: { id: number; status: SeoIssueStatus }) =>
            apiMutate("PATCH", `seo/issues/${id}/status`, { locale, body: { status } }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: root }),
    });
}

export function useSeoKeywords(filters: Record<string, string | number | undefined> = {}) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "keywords", locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<SeoKeyword>>("seo/keywords", { locale, query: filters, signal }),
    });
}

export function useSeoKeywordMutations() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    const invalidate = async () => queryClient.invalidateQueries({ queryKey: root });
    return {
        create: useMutation({
            mutationFn: (body: Partial<SeoKeyword> & { phrase: string }) => apiMutate("POST", "seo/keywords", { locale, body }),
            onSuccess: invalidate,
        }),
        update: useMutation({
            mutationFn: ({ id, ...body }: Partial<SeoKeyword> & { id: number }) =>
                apiMutate("PATCH", `seo/keywords/${id}`, { locale, body }),
            onSuccess: invalidate,
        }),
        remove: useMutation({
            mutationFn: (id: number) => apiMutate("DELETE", `seo/keywords/${id}`, { locale }),
            onSuccess: invalidate,
        }),
    };
}

function useSimpleListQuery<T>(path: string, filters: Record<string, string | number | undefined>) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, path, locale, filters],
        queryFn: ({ signal }) => apiGet<Paginated<T>>(`seo/${path}`, { locale, query: filters, signal }),
    });
}

export function useSeoCompetitors(filters: Record<string, string | number | undefined> = {}) {
    return useSimpleListQuery<SeoCompetitor>("competitors", filters);
}

export function useSeoInternalLinks(filters: Record<string, string | number | undefined> = {}) {
    return useSimpleListQuery<SeoInternalLink>("internal-links", filters);
}

export function useSeoRedirects(filters: Record<string, string | number | undefined> = {}) {
    return useSimpleListQuery<SeoRedirect>("redirects", filters);
}

export function useSeoResourceMutations() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    const invalidate = async () => queryClient.invalidateQueries({ queryKey: root });
    return {
        competitorCreate: useMutation({
            mutationFn: (body: Partial<SeoCompetitor> & { domain: string }) =>
                apiMutate("POST", "seo/competitors", { locale, body }),
            onSuccess: invalidate,
        }),
        competitorUpdate: useMutation({
            mutationFn: ({ id, ...body }: Partial<SeoCompetitor> & { id: number }) =>
                apiMutate("PATCH", `seo/competitors/${id}`, { locale, body }),
            onSuccess: invalidate,
        }),
        competitorDelete: useMutation({
            mutationFn: (id: number) => apiMutate("DELETE", `seo/competitors/${id}`, { locale }),
            onSuccess: invalidate,
        }),
        linkCreate: useMutation({
            mutationFn: (body: Partial<SeoInternalLink>) => apiMutate("POST", "seo/internal-links", { locale, body }),
            onSuccess: invalidate,
        }),
        linkUpdate: useMutation({
            mutationFn: ({ id, ...body }: Partial<SeoInternalLink> & { id: number }) =>
                apiMutate("PATCH", `seo/internal-links/${id}`, { locale, body }),
            onSuccess: invalidate,
        }),
        linkDelete: useMutation({
            mutationFn: (id: number) => apiMutate("DELETE", `seo/internal-links/${id}`, { locale }),
            onSuccess: invalidate,
        }),
        redirectCreate: useMutation({
            mutationFn: (body: Partial<SeoRedirect>) => apiMutate("POST", "seo/redirects", { locale, body }),
            onSuccess: invalidate,
        }),
        redirectUpdate: useMutation({
            mutationFn: ({ id, ...body }: Partial<SeoRedirect> & { id: number }) =>
                apiMutate("PATCH", `seo/redirects/${id}`, { locale, body }),
            onSuccess: invalidate,
        }),
        redirectDelete: useMutation({
            mutationFn: (id: number) => apiMutate("DELETE", `seo/redirects/${id}`, { locale }),
            onSuccess: invalidate,
        }),
    };
}

export function useSeoSettings() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "settings", locale],
        queryFn: ({ signal }) => apiGet<Resource<SeoSettings>>("seo/settings", { locale, signal }),
    });
}

export function useSeoSettingsMutation() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: Partial<SeoSettings>) => apiMutate<Resource<SeoSettings>>("PATCH", "seo/settings", { locale, body }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: root }),
    });
}

export function useSeoIntegrations() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "integrations", locale],
        queryFn: ({ signal }) => apiGet<Resource<SeoIntegration[]>>("seo/integrations", { locale, signal }),
    });
}

export function useSeoIntegrationMutation() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: Partial<SeoIntegration> & { provider: string }) =>
            apiMutate("PATCH", "seo/integrations", { locale, body }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: root }),
    });
}

export function useSeoIndexNowMutation() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: { urls?: string[] } = {}) =>
            apiMutate<Resource<{ accepted: boolean; count: number; status_code: number; submitted_at: string | null }>>(
                "POST",
                "seo/indexnow/submit",
                { locale, body },
            ),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: root }),
    });
}

export function useSeoRobotsPreview() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "robots", locale],
        queryFn: ({ signal }) =>
            apiGet<Resource<{ text: string; document: Record<string, unknown> }>>("seo/robots/preview", { locale, signal }),
    });
}

export function useSeoSitemapPreview() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: [...root, "sitemap", locale],
        queryFn: ({ signal }) =>
            apiGet<Resource<{ entries: Array<Record<string, unknown>>; counts: Record<string, number>; total: number }>>(
                "seo/sitemap/preview",
                { locale, signal },
            ),
    });
}
