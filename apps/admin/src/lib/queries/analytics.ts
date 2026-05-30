"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";

/**
 * Analytics report hooks. Each report widget owns a `useQuery` keyed on the shared toolbar window
 * (`from` / `to` / `interval` / `compare`) so React Query dedupes every widget on a page that asks
 * for the same window, and switching reports reuses warm caches. All calls go through the
 * same-origin proxy (`apiGet`) — never the SDK from the browser.
 */

type S = AdminSchemas["schemas"];
export type ReportSalesStats = S["ReportSalesStats"];
export type ReportSalesTotals = S["ReportSalesTotals"];
export type ReportCouponsStats = S["ReportCouponsStats"];
export type RevenueReportRow = S["RevenueReportRow"];
export type OrdersReportRow = S["OrdersReportRow"];
export type ProductsReportRow = S["ProductsReportRow"];
export type CategoriesReportRow = S["CategoriesReportRow"];
export type CouponsReportRow = S["CouponsReportRow"];
export type TaxesReportRow = S["TaxesReportRow"];
export type StockReportRow = S["StockReportRow"];
export type StockReportCounts = S["StockReportCounts"];
export type TopCategory = S["TopCategory"];
export type TopProduct = S["TopProduct"];
export type PaginationMeta = S["PaginationMeta"];

export interface ReportWindow {
    from: string;
    to: string;
    interval?: "day" | "week" | "month";
    compareFrom?: string;
    compareTo?: string;
}

function statsQuery(win: ReportWindow): Record<string, string | undefined> {
    return {
        date_from: win.from,
        date_to: win.to,
        interval: win.interval,
        compare_from: win.compareFrom,
        compare_to: win.compareTo,
    };
}

export function useSalesStats(win: ReportWindow) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["analytics", "sales-stats", { locale, ...win }],
        queryFn: () => apiGet<ReportSalesStats>("reports/sales-stats", { locale, query: statsQuery(win) }),
        placeholderData: (previous) => previous,
    });
}

export function useCouponsStats(win: ReportWindow) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["analytics", "coupons-stats", { locale, ...win }],
        queryFn: () => apiGet<ReportCouponsStats>("reports/coupons-stats", { locale, query: statsQuery(win) }),
        placeholderData: (previous) => previous,
    });
}

export interface TableParams {
    page?: number;
    limit?: number;
    orderBy?: string;
    orderDir?: "asc" | "desc";
    q?: string;
    categoryId?: number;
}

export interface ReportTableEnvelope<T> {
    data: T[];
    meta: PaginationMeta;
    totals?: ReportSalesTotals;
    counts?: StockReportCounts;
}

function useReportTable<T>(report: string, win: ReportWindow, params: TableParams) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["analytics", report, "table", { locale, from: win.from, to: win.to, interval: win.interval, ...params }],
        queryFn: () =>
            apiGet<ReportTableEnvelope<T>>(`reports/${report}`, {
                locale,
                query: {
                    date_from: win.from,
                    date_to: win.to,
                    interval: win.interval,
                    page: params.page,
                    limit: params.limit,
                    order_by: params.orderBy,
                    order_dir: params.orderDir,
                    q: params.q,
                    category_id: params.categoryId,
                },
            }),
        placeholderData: (previous) => previous,
    });
}

export const useRevenueTable = (win: ReportWindow, params: TableParams = {}) =>
    useReportTable<RevenueReportRow>("revenue", win, params);
export const useOrdersReportTable = (win: ReportWindow, params: TableParams = {}) =>
    useReportTable<OrdersReportRow>("orders", win, params);
export const useProductsReportTable = (win: ReportWindow, params: TableParams = {}) =>
    useReportTable<ProductsReportRow>("products", win, params);
export const useCategoriesReportTable = (win: ReportWindow, params: TableParams = {}) =>
    useReportTable<CategoriesReportRow>("categories", win, params);
export const useCouponsReportTable = (win: ReportWindow, params: TableParams = {}) =>
    useReportTable<CouponsReportRow>("coupons", win, params);
export const useTaxesReportTable = (win: ReportWindow, params: TableParams = {}) =>
    useReportTable<TaxesReportRow>("taxes", win, params);

export interface StockParams {
    status?: "all" | "instock" | "outofstock" | "onbackorder" | "lowstock";
    q?: string;
    page?: number;
    limit?: number;
    orderBy?: "name" | "stock" | "status";
    orderDir?: "asc" | "desc";
}

export function useStockReport(params: StockParams = {}) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["analytics", "stock", "table", { locale, ...params }],
        queryFn: () =>
            apiGet<ReportTableEnvelope<StockReportRow>>("reports/stock", {
                locale,
                query: {
                    status: params.status,
                    q: params.q,
                    page: params.page,
                    limit: params.limit,
                    order_by: params.orderBy,
                    order_dir: params.orderDir,
                },
            }),
        placeholderData: (previous) => previous,
    });
}

interface LeaderboardResponse<T> {
    data: T[];
    range: { start_date: string; end_date: string; days: number };
}

export function useTopProductsLeaderboard(days = 30, limit = 5) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["analytics", "top-products", { locale, days, limit }],
        queryFn: () => apiGet<LeaderboardResponse<TopProduct>>("reports/top-products", { locale, query: { days, limit } }),
    });
}

export function useTopCategoriesLeaderboard(days = 30, limit = 5) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["analytics", "top-categories", { locale, days, limit }],
        queryFn: () => apiGet<LeaderboardResponse<TopCategory>>("reports/top-categories", { locale, query: { days, limit } }),
    });
}
