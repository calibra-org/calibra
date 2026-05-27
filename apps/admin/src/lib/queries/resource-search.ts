"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useCallback } from "react";

import type { ComboboxOption } from "#/components/ui/combobox";

import { apiGet } from "./api-client";

export type ResourceKind = "categories" | "brands" | "tags" | "products" | "attributes" | "attribute-terms";

interface ResourceListEnvelope<T> {
    data: T[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

interface ResourceRow {
    id: number;
    name?: string;
    sku?: string | null;
    label?: string;
    slug?: string;
    image_url?: string | null;
    logo_url?: string | null;
    featured_image_url?: string | null;
}

/**
 * Adapts a raw API row into the shared `ComboboxOption` shape so the same `<ResourcePicker />`
 * can search categories, brands, tags, products, or attribute terms without per-resource glue.
 */
function adapt(row: ResourceRow, kind: ResourceKind): ComboboxOption {
    const label =
        (typeof row.label === "string" && row.label.length > 0 && row.label) ||
        (typeof row.name === "string" && row.name.length > 0 && row.name) ||
        `#${row.id}`;
    const sublabel = kind === "products" ? (row.sku ?? undefined) : (row.slug ?? undefined);
    const imageUrl = row.image_url ?? row.logo_url ?? row.featured_image_url ?? null;
    return { id: row.id, label, sublabel, imageUrl };
}

export interface ResourceSearchOptions {
    /** Search query — empty string returns the head of the list. */
    query: string;
    /** Override default limit (20). */
    limit?: number;
    /** Extra query params (e.g. `attribute_id` for attribute-terms). */
    extra?: Record<string, string | number | undefined>;
}

/** Imperative searcher — returns a single Promise. Suitable for passing into ResourcePicker. */
export function useResourceSearcher(kind: ResourceKind, baseExtra?: Record<string, string | number | undefined>) {
    const locale = useLocale() as Locale;
    return useCallback(
        async (query: string): Promise<ComboboxOption[]> => {
            const params: Record<string, string | number | undefined> = {
                ...baseExtra,
                search: query.length > 0 ? query : undefined,
                limit: 20,
            };
            const envelope = await apiGet<ResourceListEnvelope<ResourceRow>>(pathFor(kind, baseExtra), {
                locale,
                query: params,
            });
            return (envelope.data ?? []).map((row) => adapt(row, kind));
        },
        [kind, locale, baseExtra],
    );
}

/** Reactive list — useful for "show top brands" rows that don't need an open popup. */
export function useResourceList(kind: ResourceKind, options: ResourceSearchOptions = { query: "" }) {
    const locale = useLocale() as Locale;
    const { query, limit = 20, extra } = options;
    return useQuery<ComboboxOption[]>({
        queryKey: ["admin", kind, "search", { locale, query, limit, extra }],
        queryFn: async () => {
            const params: Record<string, string | number | undefined> = {
                ...extra,
                search: query.length > 0 ? query : undefined,
                limit,
            };
            const envelope = await apiGet<ResourceListEnvelope<ResourceRow>>(pathFor(kind, extra), { locale, query: params });
            return (envelope.data ?? []).map((row) => adapt(row, kind));
        },
    });
}

/** Resolve a small set of ids to full chips (used by Active filter chips). */
export function useResourceResolver(kind: ResourceKind) {
    const locale = useLocale() as Locale;
    return useCallback(
        async (ids: (number | string)[]): Promise<ComboboxOption[]> => {
            if (ids.length === 0) return [];
            const params = { ids: ids.join(","), limit: ids.length };
            const envelope = await apiGet<ResourceListEnvelope<ResourceRow>>(pathFor(kind), {
                locale,
                query: params,
            });
            return (envelope.data ?? []).map((row) => adapt(row, kind));
        },
        [kind, locale],
    );
}

function pathFor(kind: ResourceKind, extra?: Record<string, string | number | undefined>): string {
    if (kind === "attribute-terms") {
        const attributeId = extra?.attribute_id;
        if (attributeId === undefined) {
            throw new Error("attribute-terms resource requires `attribute_id` in extra");
        }
        return `attributes/${attributeId}/terms`;
    }
    return kind;
}
