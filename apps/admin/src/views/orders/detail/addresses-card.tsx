"use client";

import type { Locale } from "@calibra/shared/i18n";
import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { AdminOrder, AdminOrderAddress } from "#/lib/types";

interface AddressesCardProps {
    order: AdminOrder;
    locale: Locale;
}

/** Right-rail billing + shipping addresses. Edit dialogs are a follow-up — the PATCH endpoint only accepts customer_note/billing_email today. */
export function AddressesCard({ order, locale: _locale }: AddressesCardProps) {
    const t = useTranslations("Orders.detail");
    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <MapPin className="size-4" aria-hidden="true" />
                    {t("billing")}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4 text-xs">
                <AddressBlock heading={t("billing")} address={order.billingAddress} />
                <AddressBlock heading={t("shipping")} address={order.shippingAddress} />
            </CardContent>
        </Card>
    );
}

function AddressBlock({ heading, address }: { heading: string; address: AdminOrderAddress }) {
    if (!address.firstName && !address.lastName && !address.addressLine1) {
        return (
            <section className="flex flex-col gap-1">
                <h4 className="text-muted-foreground text-xs uppercase tracking-wide">{heading}</h4>
                <p className="text-muted-foreground">—</p>
            </section>
        );
    }
    return (
        <section className="flex flex-col gap-1">
            <h4 className="text-muted-foreground text-xs uppercase tracking-wide">{heading}</h4>
            <p className="text-sm">
                {address.firstName} {address.lastName}
            </p>
            {address.company && <p className="text-muted-foreground">{address.company}</p>}
            <p>{address.addressLine1}</p>
            {address.addressLine2 && <p>{address.addressLine2}</p>}
            <p className="text-muted-foreground">
                {address.city}
                {address.provinceCode ? ` · ${address.provinceCode}` : ""}
                {address.postcode ? ` · ${address.postcode}` : ""} · {address.country}
            </p>
            {address.phone && <p className="text-muted-foreground">{address.phone}</p>}
        </section>
    );
}
