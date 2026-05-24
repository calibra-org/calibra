"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Mail, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Link } from "#/lib/i18n/navigation";
import type { AdminOrder } from "#/lib/types";

interface CustomerCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Right-rail customer summary. Mini-stats (lifetime spend / order count / last order) are wired
 * to the customer endpoint when the user navigates; rendered as a button so the row reads as a
 * single tap-target on mobile. Guest checkouts fall through to a placeholder label.
 */
export function CustomerCard({ order, locale: _locale }: CustomerCardProps) {
    const t = useTranslations("Orders.detail.customerCard");
    const fallback = t("guest");
    const name = order.customerName || order.billingEmail || fallback;
    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <UserRound className="size-4" aria-hidden="true" />
                    {t("title")}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4 text-sm">
                <div className="flex flex-col gap-1">
                    <span className="font-medium">{name}</span>
                    {order.billingEmail && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                            <Mail className="size-3" aria-hidden="true" />
                            {order.billingEmail}
                        </span>
                    )}
                    {order.billingAddress.phone && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                            <Phone className="size-3" aria-hidden="true" />
                            {order.billingAddress.phone}
                        </span>
                    )}
                </div>
                {order.customerId !== null ? (
                    <Button asChild variant="outline" size="sm" className="self-start">
                        <Link href={`/customers/${order.customerId}` as never}>{t("viewProfile")}</Link>
                    </Button>
                ) : null}
            </CardContent>
        </Card>
    );
}
