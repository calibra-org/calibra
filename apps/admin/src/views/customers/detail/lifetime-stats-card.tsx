"use client";

import type { Locale } from "@calibra/shared/i18n";

import { StatCard } from "#/components/StatCard";
import { formatMoney, formatNumber } from "#/lib/format";
import type { AdminCustomer } from "#/lib/types";

interface LifetimeStatsCardProps {
    customer: AdminCustomer;
    locale: Locale;
    t: (key: string) => string;
}

export function LifetimeStatsCard({ customer, locale, t }: LifetimeStatsCardProps) {
    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={t("totalOrders")} value={formatNumber(customer.ordersCount, locale)} />
            <StatCard label={t("totalSpent")} value={formatMoney(customer.totalSpent, locale)} />
            <StatCard label={t("averageOrder")} value={formatMoney(customer.averageOrderValue, locale)} />
            <StatCard
                label={t("daysSinceLastOrder")}
                value={customer.daysSinceLastOrder === null ? "—" : formatNumber(customer.daysSinceLastOrder, locale)}
            />
        </div>
    );
}
