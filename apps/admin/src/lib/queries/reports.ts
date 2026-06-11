"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { type SdkAdminOrderListRow, toAdminOrderListRow } from "#/lib/adapters/orders";
import { apiGet } from "#/lib/queries/api-client";
import type { AdminOrder, MoneyMinor, SalesReport } from "#/lib/types";

interface OrderListEnvelope {
    data: SdkAdminOrderListRow[];
}

/**
 * Builds the 14-day revenue/orders series from the order list. Relocated verbatim from the deleted
 * `server-repos.ts` `buildSalesSeries` so it runs client-side inside the React Query `select`; pure
 * function, no server imports.
 */
function buildSalesSeries(orders: AdminOrder[]): { date: string; revenue: MoneyMinor; orders: number }[] {
    const buckets = new Map<string, { revenue: number; orders: number }>();
    const today = new Date();
    for (let i = 13; i >= 0; i -= 1) {
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

/**
 * Aggregates the sales report client-side from `GET /admin/orders?limit=100`. There is no first-party
 * reports endpoint yet, so the report is composed from the order list exactly as the deleted
 * `server-repos.getSalesReport` did — the math is copied verbatim, only the fetch moved to the
 * same-origin proxy. When a real report operation lands, swap the `queryFn` for that single call.
 */
export function useSalesReport() {
    const locale = useLocale() as Locale;
    return useQuery<OrderListEnvelope, Error, SalesReport>({
        queryKey: ["admin", "reports", "sales", { locale }],
        queryFn: ({ signal }) => apiGet<OrderListEnvelope>("orders", { locale, query: { limit: 100 }, signal }),
        select: (payload): SalesReport => {
            const orders = (payload.data ?? []).map(toAdminOrderListRow);
            const totalRevenue = orders.reduce((s, o) => s + Number(o.grandTotal), 0) as MoneyMinor;
            const orderCount = orders.length;
            const avg = orderCount === 0 ? 0 : Math.floor(totalRevenue / orderCount);
            return {
                totalRevenue,
                netRevenue: totalRevenue,
                refundedAmount: 0 as MoneyMinor,
                averageOrderValue: avg as MoneyMinor,
                orderCount,
                series: buildSalesSeries(orders).map((p) => ({ ...p, refunded: 0 as MoneyMinor })),
            };
        },
        staleTime: 5 * 60 * 1000,
    });
}
