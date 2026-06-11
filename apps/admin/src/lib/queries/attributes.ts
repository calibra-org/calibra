"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { AdminAttribute, AdminAttributeTerm, LocalizedString } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminAttribute = Schemas["AdminAttribute"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];

interface AttributeListEnvelope {
    data: SdkAdminAttribute[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

interface AttributeResourceEnvelope {
    data: SdkAdminAttribute;
}

interface TermListEnvelope {
    data: SdkAdminTaxonomy[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function normalizeOrderBy(value: string | null | undefined): AdminAttribute["orderBy"] {
    return value === "name" || value === "id" ? value : "menu_order";
}

/**
 * Adapts the SDK attribute wire shape into the admin view type. `termCount` is initialised to
 * zero — the attributes index endpoint does not expose a term count, so the list lazy-loads the
 * real count per row via {@link useAttributeTerms} on expand instead of an eager fan-out.
 */
export function toAdminAttribute(a: SdkAdminAttribute): AdminAttribute {
    return {
        id: a.id,
        code: a.code,
        name: dup(a.name),
        termCount: 0,
        orderBy: normalizeOrderBy(a.order_by),
        hasArchives: Boolean(a.has_archives),
    };
}

function toAdminTerm(attributeId: number, t: SdkAdminTaxonomy): AdminAttributeTerm {
    return { id: t.id, attributeId, name: dup(t.name), slug: t.slug };
}

export interface AttributesListParams {
    page?: number;
    limit?: number;
    search?: string;
}

/**
 * Browser-side attributes list. Reads `GET /admin/attributes` through the same-origin proxy and
 * maps each row via {@link toAdminAttribute}. Crucially this does NOT fan out a terms request per
 * attribute — the old SSR repo fired one `GET /attributes/{id}/terms` per row to build an
 * 8-name preview, which stacked sub-requests inside one tenant transaction and exhausted the
 * connection pool. Term counts / names are loaded lazily on row-expand instead.
 */
export function useAttributesList(params: AttributesListParams = {}) {
    const locale = useLocale() as Locale;
    const page = params.page ?? 1;
    const limit = params.limit ?? 200;
    const search = params.search;
    return useQuery<AttributeListEnvelope, Error, AdminAttribute[]>({
        queryKey: ["admin", "attributes", "list", { locale, page, limit, search }],
        queryFn: ({ signal }) =>
            apiGet<AttributeListEnvelope>("attributes", { locale, query: { page, limit, q: search }, signal }),
        select: (payload) => (payload.data ?? []).map(toAdminAttribute),
        staleTime: 30_000,
    });
}

/**
 * Single attribute by id. Keyed by `id`; locale lives in the key so a language flip refetches
 * the localized name. `enabled: id > 0` guards against the route param resolving late.
 */
export function useAttribute(id: number) {
    const locale = useLocale() as Locale;
    return useQuery<AttributeResourceEnvelope, Error, AdminAttribute>({
        queryKey: ["admin", "attributes", "detail", id, { locale }],
        queryFn: ({ signal }) => apiGet<AttributeResourceEnvelope>(`attributes/${id}`, { locale, signal }),
        select: (payload) => toAdminAttribute(payload.data),
        enabled: id > 0,
    });
}

export interface AttributeTermsParams {
    attributeId: number;
    page?: number;
    limit?: number;
    search?: string;
    /** Gate the request so the list only hits the API once a row is expanded / the page mounts. */
    enabled?: boolean;
}

/**
 * Terms for a single attribute, loaded lazily. The attributes list calls this on row-expand
 * (`enabled` flips to `true` only for the open row) so the index render costs exactly one
 * request — the per-attribute terms fan-out the old SSR repo did is gone.
 */
export function useAttributeTerms(params: AttributeTermsParams) {
    const locale = useLocale() as Locale;
    const { attributeId } = params;
    const page = params.page ?? 1;
    const limit = params.limit ?? 200;
    const search = params.search;
    return useQuery<TermListEnvelope, Error, AdminAttributeTerm[]>({
        queryKey: ["admin", "attribute-terms", attributeId, "list", { locale, page, limit, search }],
        queryFn: ({ signal }) =>
            apiGet<TermListEnvelope>(`attributes/${attributeId}/terms`, { locale, query: { page, limit, q: search }, signal }),
        select: (payload) => (payload.data ?? []).map((row) => toAdminTerm(attributeId, row)),
        enabled: (params.enabled ?? true) && attributeId > 0,
        staleTime: 30_000,
    });
}
