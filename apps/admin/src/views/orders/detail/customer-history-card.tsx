"use client";

import type { Locale } from "@calibra/shared/i18n";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { formatMoney, formatNumber } from "#/lib/format";
import { useOrderCustomerStats } from "#/lib/queries/orders";

interface CustomerHistoryCardProps {
    orderId: number;
    customerId: number | null;
    locale: Locale;
}

/**
 * Three-stat sidebar card: lifetime order count, lifetime revenue, and AOV for the order's
 * customer. Backed by the cached `/customer-stats` endpoint (60s). Guest orders short-circuit
 * to an empty state so the operator isn't confused by zeros they can't change.
 */
export function CustomerHistoryCard({ orderId, customerId, locale }: CustomerHistoryCardProps) {
    const t = useTranslations("Orders.detail.customerHistory");
    const { data, isPending, refetch, isFetching } = useOrderCustomerStats(orderId);

    if (customerId === null) {
        return <EmptyState title={t("guest.title")} description={t("guest.description")} />;
    }

    if (isPending) {
        return (
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 text-sm">
            <Row label={t("totalOrders")} value={formatNumber(data?.lifetime_order_count ?? 0, locale)} />
            <Row label={t("totalRevenue")} value={formatMoney(data?.lifetime_revenue_minor ?? 0, locale)} />
            <Row label={t("aov")} value={formatMoney(data?.average_order_value_minor ?? 0, locale)} />
            <Button
                variant="ghost"
                size="sm"
                className="ms-auto h-7 px-2 text-muted-foreground text-xs"
                onClick={() => refetch()}
                disabled={isFetching}
            >
                <RefreshCw className="size-3" aria-hidden="true" />
                {t("refresh")}
            </Button>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
        </div>
    );
}
