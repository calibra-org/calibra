"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import type { AdminOrder, AdminOrderAddress } from "#/lib/types";

interface AddressesCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Sidebar billing + shipping addresses. Renders as a section body. The Phase 2 inline edit
 * mode (pencil-to-form with react-hook-form + zod, autosave on blur, copy billing→shipping)
 * lands in the address-form follow-up commit on this PR.
 */
export function AddressesCard({ order, locale: _locale }: AddressesCardProps) {
    const t = useTranslations("Orders.detail");
    return (
        <div className="flex flex-col gap-4 text-xs">
            <AddressBlock heading={t("billing")} address={order.billingAddress} />
            <AddressBlock heading={t("shipping")} address={order.shippingAddress} />
        </div>
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
