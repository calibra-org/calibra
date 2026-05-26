"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { AdminCustomerInsights } from "#/lib/types";

interface SdkAdminCustomerInsights {
    total: number;
    total_delta_30d: number;
    avg_order_count: number;
    avg_order_count_delta_30d: number;
    avg_lifetime_spend_minor: number;
    avg_lifetime_spend_delta_30d_pct: number;
    avg_order_value_minor: number;
    avg_order_value_delta_30d_pct: number;
    pct_with_account: number;
    sparklines: { total: number[]; spend_minor: number[] };
    generated_at: string;
}

function adapt(payload: SdkAdminCustomerInsights): AdminCustomerInsights {
    return {
        total: payload.total,
        totalDelta30d: payload.total_delta_30d,
        avgOrderCount: payload.avg_order_count,
        avgOrderCountDelta30d: payload.avg_order_count_delta_30d,
        avgLifetimeSpend: payload.avg_lifetime_spend_minor,
        avgLifetimeSpendDelta30dPct: payload.avg_lifetime_spend_delta_30d_pct,
        avgOrderValue: payload.avg_order_value_minor,
        avgOrderValueDelta30dPct: payload.avg_order_value_delta_30d_pct,
        pctWithAccount: payload.pct_with_account,
        sparklines: {
            total: payload.sparklines.total,
            spend: payload.sparklines.spend_minor,
        },
        generatedAt: payload.generated_at,
    };
}

/**
 * Fetches the `/insights/customers` dashboard summary. Server-side cache is 5 minutes; the
 * client adds a focus-revalidation pass so an operator coming back to the tab sees fresh-ish
 * numbers without manually hitting Refresh.
 */
export function useCustomerInsights() {
    const locale = useLocale() as Locale;
    return useQuery<{ data: SdkAdminCustomerInsights }, Error, AdminCustomerInsights>({
        queryKey: ["dashboard", "insights", "customers", { locale }],
        queryFn: () => apiGet<{ data: SdkAdminCustomerInsights }>("insights/customers", { locale }),
        select: (payload) => adapt(payload.data),
        staleTime: 60_000,
    });
}
