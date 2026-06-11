"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { type AdminProductDetailView, toAdminProductDetail } from "#/lib/adapters/product-detail";
import { apiGet } from "#/lib/queries/api-client";

type Schemas = AdminSchemas["schemas"];

interface ProductDetailEnvelope {
    data: Schemas["AdminProductDetail"];
}

/**
 * A single product's full detail payload, normalised into the view shape. Keyed by `id`; the
 * locale rides the query key so a language flip refetches the localized payload. `enabled: id > 0`
 * keeps the hook dormant until the route param resolves, so the loader can render a skeleton.
 */
export function useProductDetail(id: number) {
    const locale = useLocale() as Locale;
    return useQuery<ProductDetailEnvelope, Error, AdminProductDetailView>({
        queryKey: ["admin", "product", id, { locale }],
        queryFn: ({ signal }) => apiGet<ProductDetailEnvelope>(`products/${id}`, { locale, signal }),
        select: (envelope) => toAdminProductDetail(envelope.data),
        enabled: id > 0,
        staleTime: 5 * 1000,
    });
}

/** A `{ id, slug, name }` option for the product-detail tax/shipping-class selects. */
export interface ProductClassOption {
    id: number;
    slug: string;
    name: string;
}

interface ClassOptionRow {
    id: number;
    slug?: string | null;
    name?: string | null;
}

interface ClassOptionsEnvelope {
    data: ClassOptionRow[];
}

/** Coalesces a raw class row into a render-ready `{ id, slug, name }` option. */
function toProductClassOption(row: ClassOptionRow): ProductClassOption {
    const slug = row.slug ?? "";
    return { id: Number(row.id), slug, name: row.name ?? slug };
}

/**
 * Tax-class options for the product-detail tax-class select. Backed by `GET /admin/tax-classes`,
 * which returns simple `{ id, slug, name }` rows. Cached for five minutes since the class list is
 * effectively static across an editing session. Shared by both the detail and new-product pages.
 */
export function useTaxClassOptions() {
    const locale = useLocale() as Locale;
    return useQuery<ClassOptionsEnvelope, Error, ProductClassOption[]>({
        queryKey: ["admin", "tax-classes", "options", { locale }],
        queryFn: ({ signal }) => apiGet<ClassOptionsEnvelope>("tax-classes", { locale, signal }),
        select: (envelope) => (envelope.data ?? []).map(toProductClassOption),
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Shipping-class options for the product-detail shipping-class select. Backed by
 * `GET /admin/shipping-classes`; same `{ id, slug, name }` shape and caching as
 * {@link useTaxClassOptions}. Shared by both the detail and new-product pages.
 */
export function useShippingClassOptions() {
    const locale = useLocale() as Locale;
    return useQuery<ClassOptionsEnvelope, Error, ProductClassOption[]>({
        queryKey: ["admin", "shipping-classes", "options", { locale }],
        queryFn: ({ signal }) => apiGet<ClassOptionsEnvelope>("shipping-classes", { locale, signal }),
        select: (envelope) => (envelope.data ?? []).map(toProductClassOption),
        staleTime: 5 * 60 * 1000,
    });
}
