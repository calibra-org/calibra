"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Link } from "#/lib/i18n/navigation";
import type { AdminOrder } from "#/lib/types";

interface CustomerCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Right-rail customer summary — name + contact + a link to the full profile. Renders as a
 * section body (the surrounding chrome comes from {@link DraggableSectionGrid}).
 */
export function CustomerCard({ order, locale: _locale }: CustomerCardProps) {
    const t = useTranslations("Orders.detail.customerCard");
    const fallback = t("guest");
    const name = order.customerName || order.billingEmail || fallback;
    return (
        <div className="flex flex-col gap-3 text-sm">
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
        </div>
    );
}
