"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { AdminRegionalCountry, AdminRegionalProvinceDetail } from "#/lib/types";

/* ----------------------------- Wire types ------------------------------ */

interface SdkProvinceRow {
    region_id: number;
    code: string;
    name: { fa: string; en: string };
    orders_count: number;
    revenue_minor: string;
}

interface SdkCountryEnvelope {
    data: SdkProvinceRow[];
    meta: {
        range: { from: string; to: string };
        totals: { orders_count: number; revenue_minor: string };
        locale: string;
    };
}

interface SdkRegionalCounty {
    name: { fa: string; en: string | null };
    orders_count: number;
    revenue_minor: string;
    matched: boolean;
}

interface SdkProvinceDetailEnvelope {
    data: {
        region_id: number;
        code: string;
        name: { fa: string; en: string };
        orders_count: number;
        revenue_minor: string;
        top_products: Array<{
            product_id: number;
            name: string;
            sku: string | null;
            units: number;
            revenue_minor: string;
        }>;
        counties: SdkRegionalCounty[];
    };
    meta: {
        range: { from: string; to: string };
        locale: string;
    };
}

function adaptCountry(payload: SdkCountryEnvelope): AdminRegionalCountry {
    return {
        rows: payload.data.map((row) => ({
            regionId: row.region_id,
            code: row.code,
            name: row.name,
            ordersCount: row.orders_count,
            revenueMinor: Number(row.revenue_minor),
        })),
        totals: {
            ordersCount: payload.meta.totals.orders_count,
            revenueMinor: Number(payload.meta.totals.revenue_minor),
        },
        range: payload.meta.range,
    };
}

function adaptProvince(payload: SdkProvinceDetailEnvelope): AdminRegionalProvinceDetail {
    return {
        regionId: payload.data.region_id,
        code: payload.data.code,
        name: payload.data.name,
        ordersCount: payload.data.orders_count,
        revenueMinor: Number(payload.data.revenue_minor),
        topProducts: payload.data.top_products.map((p) => ({
            productId: p.product_id,
            name: p.name,
            sku: p.sku,
            units: p.units,
            revenueMinor: Number(p.revenue_minor),
        })),
        counties: payload.data.counties.map((c) => ({
            name: c.name,
            ordersCount: c.orders_count,
            revenueMinor: Number(c.revenue_minor),
            matched: c.matched,
        })),
        range: payload.meta.range,
    };
}

export interface RegionalFilters {
    /** ISO datetime (Gregorian UTC). Omit for the trailing-30-days server default. */
    from?: string;
    /** ISO datetime (Gregorian UTC). Omit for the trailing-30-days server default. */
    to?: string;
    metric?: "orders" | "revenue";
}

/**
 * Country-mode regional insights. Returns 31 rows + totals + range. Re-fetched whenever
 * `filters.from` / `filters.to` / `filters.metric` change, and invalidated alongside every
 * other widget by the dashboard's Refresh button (`["dashboard", "regional", …]`).
 */
export function useRegionalProvinces(filters: RegionalFilters = {}) {
    const locale = useLocale() as Locale;
    return useQuery<SdkCountryEnvelope, Error, AdminRegionalCountry>({
        queryKey: ["dashboard", "regional", "provinces", { locale, ...filters }],
        queryFn: () =>
            apiGet<SdkCountryEnvelope>("insights/regional/provinces", {
                locale,
                query: { from: filters.from, to: filters.to, metric: filters.metric },
            }),
        select: adaptCountry,
        staleTime: 60_000,
    });
}

export interface RegionalProvinceFilters extends RegionalFilters {
    /** Number of top products to surface in the side panel (1..10; default 5). */
    topProducts?: number;
}

/**
 * Province-mode regional insights for a single `IR-NN` province. Lazy — only enabled when the
 * caller passes a non-null `code`, so the country view doesn't pay for a detail fetch.
 */
export function useRegionalProvinceDetail(code: string | null, filters: RegionalProvinceFilters = {}) {
    const locale = useLocale() as Locale;
    return useQuery<SdkProvinceDetailEnvelope, Error, AdminRegionalProvinceDetail>({
        queryKey: ["dashboard", "regional", "province", code, { locale, ...filters }],
        queryFn: () =>
            apiGet<SdkProvinceDetailEnvelope>(`insights/regional/provinces/${code}`, {
                locale,
                query: {
                    from: filters.from,
                    to: filters.to,
                    top_products: filters.topProducts,
                },
            }),
        select: adaptProvince,
        staleTime: 60_000,
        enabled: code !== null && code.length > 0,
    });
}
