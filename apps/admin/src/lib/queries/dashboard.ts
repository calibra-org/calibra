"use client";

import type { AdminSchemas } from "@calibra/sdk";
import type { Locale } from "@calibra/shared/i18n";
import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { toAdminCustomer } from "#/lib/adapters/customers";
import { type SdkAdminOrderListRow, toAdminOrderListRow } from "#/lib/adapters/orders";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminCustomer, AdminOrder, MoneyMinor, OrderStatus } from "#/lib/types";

/**
 * Dashboard widget hooks. Each widget owns its own `useQuery`, but widgets derived from the same
 * resource (every orders-shaped KPI / chart / table on the page) share a single underlying fetch
 * keyed by `["dashboard", "orders", { locale }]` and select their slice client-side. React Query
 * dedupes the network call across the page even though the dashboard mounts seven hooks at once.
 *
 * Invalidate the entire dashboard with `queryClient.invalidateQueries({ queryKey: ["dashboard"] })`.
 */

type Schemas = AdminSchemas["schemas"];
type SdkAdminProduct = Schemas["AdminProduct"];
type SdkAdminCustomer = Schemas["AdminCustomer"];

interface SdkPaginated<T> {
    data: T[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* --- Underlying queries shared across widgets ------------------------------ */

type OrderQueryOptions<TSelected> = Omit<UseQueryOptions<AdminOrder[], Error, TSelected>, "queryKey" | "queryFn">;

/**
 * Pulls the recent orders window the dashboard derives every order-shaped widget from. Default 100
 * matches the previous server-side aggregation — enough rows for a 14-day sales chart at typical
 * traffic without paging the API.
 */
function useAdminOrdersQuery<TSelected = AdminOrder[]>(limit = 100, options: OrderQueryOptions<TSelected> = {}) {
    const locale = useLocale() as Locale;
    return useQuery<AdminOrder[], Error, TSelected>({
        queryKey: ["dashboard", "orders", { locale, limit }],
        queryFn: async () => {
            const payload = await apiGet<SdkPaginated<SdkAdminOrderListRow>>("orders", { locale, query: { limit } });
            return (payload.data ?? []).map(toAdminOrderListRow);
        },
        ...options,
    });
}

type CustomerQueryOptions<TSelected> = Omit<UseQueryOptions<AdminCustomer[], Error, TSelected>, "queryKey" | "queryFn">;

function useAdminCustomersQuery<TSelected = AdminCustomer[]>(limit = 10, options: CustomerQueryOptions<TSelected> = {}) {
    const locale = useLocale() as Locale;
    return useQuery<AdminCustomer[], Error, TSelected>({
        queryKey: ["dashboard", "customers", { locale, limit }],
        queryFn: async () => {
            const payload = await apiGet<SdkPaginated<SdkAdminCustomer>>("customers", { locale, query: { limit } });
            return (payload.data ?? []).map(toAdminCustomer);
        },
        ...options,
    });
}

/* --- Public per-widget hooks ----------------------------------------------- */

function withinLast24h(iso: string, now: number): boolean {
    return now - new Date(iso).getTime() <= DAY_MS;
}

/** Count of orders created in the trailing 24 hours. */
export function useOrdersTodayStats() {
    return useAdminOrdersQuery<number>(100, {
        select: (orders) => {
            const now = Date.now();
            return orders.filter((o) => withinLast24h(o.createdAt, now)).length;
        },
    });
}

/** Sum of `grandTotal` for orders created in the trailing 24 hours. */
export function useRevenueTodayStats() {
    return useAdminOrdersQuery<MoneyMinor>(100, {
        select: (orders) => {
            const now = Date.now();
            return orders
                .filter((o) => withinLast24h(o.createdAt, now))
                .reduce((sum, o) => sum + Number(o.grandTotal), 0) as MoneyMinor;
        },
    });
}

/** Count of orders awaiting fulfilment (status `pending` or `processing`). */
export function usePendingFulfilmentsStats() {
    return useAdminOrdersQuery<number>(100, {
        select: (orders) => orders.filter((o) => o.status === "pending" || o.status === "processing").length,
    });
}

/** Daily revenue + order-count buckets for the trailing `days` (defaults to 14, the chart's range). */
export function useSalesSeries(days = 14) {
    return useAdminOrdersQuery<{ date: string; revenue: MoneyMinor; orders: number }[]>(100, {
        select: (orders) => buildSalesSeries(orders, days),
    });
}

/** Grouped count of orders by status, for the donut. */
export function useOrdersByStatus() {
    return useAdminOrdersQuery<{ status: OrderStatus; count: number }[]>(100, {
        select: (orders) => {
            const counts = new Map<OrderStatus, number>();
            for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
            return [...counts.entries()].map(([status, count]) => ({ status, count }));
        },
    });
}

/** Most-recent orders for the dashboard table. */
export function useRecentOrders(limit = 8) {
    return useAdminOrdersQuery<AdminOrder[]>(100, {
        select: (orders) => orders.slice(0, limit),
    });
}

/** Most-recent customers for the dashboard list. */
export function useRecentCustomers(limit = 5) {
    return useAdminCustomersQuery<AdminCustomer[]>(Math.max(limit, 10), {
        select: (customers) => customers.slice(0, limit),
    });
}

/** Count of customers registered in the trailing 24 hours. */
export function useNewCustomersTodayStats() {
    return useAdminCustomersQuery<number>(10, {
        select: (customers) => {
            const now = Date.now();
            return customers.filter((c) => withinLast24h(c.createdAt, now)).length;
        },
    });
}

/** Total count of published products in the catalog (read from the paginated response meta). */
export function useActiveProductsCount() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["dashboard", "products", "activeCount", { locale }],
        queryFn: async () => {
            const payload = await apiGet<SdkPaginated<SdkAdminProduct>>("products", {
                locale,
                query: { limit: 1, status: "published" },
            });
            return payload.meta?.total ?? 0;
        },
    });
}

interface TopProductsRow {
    product_id: number;
    name: string;
    sku: string | null;
    units: number;
    revenue: number;
}

interface TopProductsResponse {
    data: TopProductsRow[];
    range: { start_date: string; end_date: string; days: number };
}

export interface TopProduct {
    productId: number;
    name: string;
    sku: string;
    units: number;
    revenue: MoneyMinor;
}

/**
 * Best-selling products over a trailing window (default 30 days, top 5). Backed by
 * `/api/v1/admin/reports/top-products`, which already filters to `processing` + `completed` orders
 * and resolves the locale server-side, so we don't need to massage the response.
 */
export function useTopProducts(options: { days?: number; limit?: number } = {}) {
    const locale = useLocale() as Locale;
    const days = options.days ?? 30;
    const limit = options.limit ?? 5;
    return useQuery<TopProductsResponse, Error, TopProduct[]>({
        queryKey: ["dashboard", "topProducts", { locale, days, limit }],
        queryFn: () => apiGet<TopProductsResponse>("reports/top-products", { locale, query: { days, limit } }),
        select: (payload) =>
            payload.data.map((row) => ({
                productId: row.product_id,
                name: row.name,
                sku: row.sku ?? "",
                units: row.units,
                revenue: row.revenue as MoneyMinor,
            })),
    });
}

function buildSalesSeries(orders: AdminOrder[], days: number): { date: string; revenue: MoneyMinor; orders: number }[] {
    const buckets = new Map<string, { revenue: number; orders: number }>();
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { revenue: 0, orders: 0 });
    }
    for (const o of orders) {
        const key = new Date(o.createdAt).toISOString().slice(0, 10);
        const bucket = buckets.get(key);
        if (bucket === undefined) continue;
        bucket.revenue += Number(o.grandTotal);
        bucket.orders += 1;
    }
    return [...buckets.entries()].map(([date, v]) => ({ date, revenue: v.revenue as MoneyMinor, orders: v.orders }));
}
