"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { formatMoney } from "#/lib/format";
import type { AdminOrder } from "#/lib/types";

interface SummaryCardProps {
    order: AdminOrder;
    locale: Locale;
}

/** Money breakdown sidebar — items / shipping / tax / discount / grand total. */
export function SummaryCard({ order, locale }: SummaryCardProps) {
    const t = useTranslations("Orders.detail");
    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="text-sm">{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-4 text-sm">
                <Row label={t("itemsTotal")} value={formatMoney(order.itemsTotal, locale)} />
                <Row label={t("shippingTotal")} value={formatMoney(order.shippingTotal, locale)} />
                <Row label={t("taxTotal")} value={formatMoney(order.taxTotal, locale)} />
                {order.discountTotal > 0 && (
                    <Row label={t("discountTotal")} value={`− ${formatMoney(order.discountTotal, locale)}`} tone="emerald-600" />
                )}
                <Separator />
                <Row label={t("grandTotal")} value={formatMoney(order.grandTotal, locale)} emphasis />
            </CardContent>
        </Card>
    );
}

function Row({ label, value, tone, emphasis }: { label: string; value: string; tone?: string; emphasis?: boolean }) {
    return (
        <div className={`flex justify-between ${tone ? `text-${tone}` : ""}`}>
            <span className={emphasis ? "font-semibold text-base" : "text-muted-foreground"}>{label}</span>
            <span className={emphasis ? "font-semibold text-base" : ""}>{value}</span>
        </div>
    );
}
