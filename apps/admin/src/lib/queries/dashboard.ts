"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { AdminSchemas } from "@calibra/sdk";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useLocale } from "next-intl";

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

/** The /admin/orders index returns this trimmed shape, not the full OrderDetail. */
interface SdkAdminOrderListRow {
    id?: number;
    order_number?: number;
    status?: string;
    customer_id?: number | null;
    billing_email?: string | null;
    grand_total?: number;
    currency?: string;
    created_at?: string;
}

interface SdkPaginated<T> {
    data: T[];
    meta?: { page: number; perPage: number; total: number; lastPage: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
    draft: "draft",
    pending: "pending",
    on_hold: "on_hold",
    processing: "processing",
    completed: "completed",
    cancelled: "cancelled",
    refunded: "refunded",
    failed: "failed",
};

class ProxyError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ProxyError";
    }
}

/**
 * Fetches the same-origin proxy at `/api/admin/<path>` with `Accept-Language` set from the active
 * UI locale. The proxy injects the bearer server-side; client code never touches the token. 401 /
 * 403 propagate as a {@link ProxyError} so React Query surfaces them — the proxy has already
 * cleared the session cookie on the way out, so the next render bounces to /login.
 */
async function fetchAdmin<T>(path: string, query: Record<string, string | number | undefined>, locale: Locale): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        search.set(k, String(v));
    }
    const qs = search.toString();
    const url = qs.length > 0 ? `/api/admin/${path}?${qs}` : `/api/admin/${path}`;
    const res = await fetch(url, {
        method: "GET",
        headers: { "accept-language": locale, accept: "application/json" },
    });
    if (!res.ok) throw new ProxyError(`admin proxy returned ${res.status}`, res.status);
    return (await res.json()) as T;
}

/** Fans the locale-resolved API string out to both `fa` and `en` keys (mirrors server-repos). */
function dup(value: string | null | undefined) {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function normaliseStatus(raw: string | null | undefined): OrderStatus {
    return ORDER_STATUS_MAP[String(raw ?? "pending")] ?? "pending";
}

function toAdminOrderListRow(o: SdkAdminOrderListRow): AdminOrder {
    return {
        id: o.id ?? 0,
        orderNumber: Number(o.order_number ?? o.id ?? 0),
        orderKey: "",
        status: normaliseStatus(o.status),
        customerId: o.customer_id !== null && o.customer_id !== undefined ? Number(o.customer_id) : null,
        customerName: o.billing_email ?? "",
        billingEmail: o.billing_email ?? "",
        currency: "IRR",
        currencyDisplay: "IRR",
        grandTotal: Number(o.grand_total ?? 0) as MoneyMinor,
        itemsTotal: 0 as MoneyMinor,
        shippingTotal: 0 as MoneyMinor,
        discountTotal: 0 as MoneyMinor,
        taxTotal: 0 as MoneyMinor,
        paymentMethodTitle: dup(""),
        createdAt: o.created_at ?? new Date().toISOString(),
        paidAt: null,
        completedAt: null,
        billingAddress: emptyAddress(),
        shippingAddress: emptyAddress(),
        lineItems: [],
        shippingLines: [],
        couponLines: [],
        taxLines: [],
        history: [],
        notes: [],
    };
}

function emptyAddress() {
    return {
        firstName: "",
        lastName: "",
        company: null,
        addressLine1: "",
        addressLine2: null,
        city: "",
        provinceCode: "",
        postcode: "",
        country: "",
        phone: "",
        nationalId: null,
    };
}

function toAdminCustomer(c: SdkAdminCustomer): AdminCustomer {
    const iran = c.profile_extensions?.iran;
    return {
        id: Number(c.id),
        userId: c.user?.id !== undefined ? Number(c.user.id) : null,
        firstName: c.first_name ?? "",
        lastName: c.last_name ?? "",
        email: c.user?.email ?? "",
        phone: c.phone ?? "",
        nationalId: iran?.national_id ?? null,
        companyName: iran?.legal_company_name_fa ?? null,
        isPayingCustomer: Boolean(c.is_paying_customer),
        ordersCount: 0,
        totalSpent: 0 as MoneyMinor,
        lastOrderAt: null,
        createdAt: c.created_at ?? new Date().toISOString(),
        addresses: [],
        downloads: [],
    };
}

/* --- Underlying queries shared across widgets ------------------------------ */

type OrderQueryOptions<TSelected> = Omit<UseQueryOptions<AdminOrder[], Error, TSelected>, "queryKey" | "queryFn">;

/**
 * Pulls the recent orders window the dashboard derives every order-shaped widget from. Default 100
 * matches the previous server-side aggregation — enough rows for a 14-day sales chart at typical
 * traffic without paging the API.
 */
function useAdminOrdersQuery<TSelected = AdminOrder[]>(perPage = 100, options: OrderQueryOptions<TSelected> = {}) {
    const locale = useLocale() as Locale;
    return useQuery<AdminOrder[], Error, TSelected>({
        queryKey: ["dashboard", "orders", { locale, perPage }],
        queryFn: async () => {
            const payload = await fetchAdmin<SdkPaginated<SdkAdminOrderListRow>>("orders", { perPage }, locale);
            return (payload.data ?? []).map(toAdminOrderListRow);
        },
        ...options,
    });
}

type CustomerQueryOptions<TSelected> = Omit<UseQueryOptions<AdminCustomer[], Error, TSelected>, "queryKey" | "queryFn">;

function useAdminCustomersQuery<TSelected = AdminCustomer[]>(perPage = 10, options: CustomerQueryOptions<TSelected> = {}) {
    const locale = useLocale() as Locale;
    return useQuery<AdminCustomer[], Error, TSelected>({
        queryKey: ["dashboard", "customers", { locale, perPage }],
        queryFn: async () => {
            const payload = await fetchAdmin<SdkPaginated<SdkAdminCustomer>>("customers", { perPage }, locale);
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
            return orders.filter((o) => withinLast24h(o.createdAt, now)).reduce((sum, o) => sum + Number(o.grandTotal), 0) as MoneyMinor;
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
            const payload = await fetchAdmin<SdkPaginated<SdkAdminProduct>>("products", { perPage: 1, status: "published" }, locale);
            return payload.meta?.total ?? 0;
        },
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
