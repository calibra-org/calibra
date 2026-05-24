"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Separator } from "#/components/ui/separator";
import { formatMoney } from "#/lib/format";
import type { AdminOrder } from "#/lib/types";

interface SummaryCardProps {
    order: AdminOrder;
    locale: Locale;
}

/** Money breakdown — items / shipping / tax / discount / grand total. Renders as a section body. */
export function SummaryCard({ order, locale }: SummaryCardProps) {
    const t = useTranslations("Orders.detail");
    return (
        <div className="flex flex-col gap-2 text-sm">
            <Row label={t("itemsTotal")} value={formatMoney(order.itemsTotal, locale)} />
            <Row label={t("shippingTotal")} value={formatMoney(order.shippingTotal, locale)} />
            <Row label={t("taxTotal")} value={formatMoney(order.taxTotal, locale)} />
            {order.feesTotal > 0 && <Row label={t("feesTotal")} value={formatMoney(order.feesTotal, locale)} />}
            {order.discountTotal > 0 && (
                <Row label={t("discountTotal")} value={`− ${formatMoney(order.discountTotal, locale)}`} muted />
            )}
            <Separator />
            <Row label={t("grandTotal")} value={formatMoney(order.grandTotal, locale)} emphasis />
        </div>
    );
}

function Row({ label, value, muted, emphasis }: { label: string; value: string; muted?: boolean; emphasis?: boolean }) {
    return (
        <div className="flex justify-between">
            <span
                className={
                    emphasis
                        ? "font-semibold text-base"
                        : muted
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground"
                }
            >
                {label}
            </span>
            <span
                className={
                    emphasis
                        ? "font-semibold text-base tabular-nums"
                        : muted
                          ? "text-emerald-700 tabular-nums dark:text-emerald-300"
                          : "tabular-nums"
                }
            >
                {value}
            </span>
        </div>
    );
}
