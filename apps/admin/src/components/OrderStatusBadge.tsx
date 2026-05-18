import { useTranslations } from "next-intl";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import type { OrderStatus } from "#/lib/mock/types";

/**
 * Maps the ADR order-status enum to a `StatusBadge` tone. Single source of truth so every page
 * (orders list, dashboard, customer detail) renders status pills identically.
 */
const toneFor: Record<OrderStatus, StatusTone> = {
    draft: "neutral",
    pending: "warning",
    on_hold: "warning",
    processing: "info",
    completed: "success",
    cancelled: "neutral",
    refunded: "danger",
    failed: "danger",
};

interface OrderStatusBadgeProps {
    status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
    const t = useTranslations("OrderStatus");
    return <StatusBadge tone={toneFor[status]}>{t(status)}</StatusBadge>;
}
