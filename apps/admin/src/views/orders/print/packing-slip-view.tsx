"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "#/components/ui/button";
import { formatDateTime, formatNumber } from "#/lib/format";
import type { AdminOrder } from "#/lib/types";

interface PackingSlipViewProps {
    order: AdminOrder;
    locale: Locale;
    autoPrint: boolean;
}

/**
 * Packing slip — no money, just the items + quantities + ship-to address. Same auto-print +
 * print-CSS pattern as the invoice view.
 */
export function PackingSlipView({ order, locale, autoPrint }: PackingSlipViewProps) {
    const t = useTranslations("Orders.print");

    useEffect(() => {
        if (!autoPrint) return;
        const timer = window.setTimeout(() => window.print(), 200);
        return () => window.clearTimeout(timer);
    }, [autoPrint]);

    return (
        <article className="mx-auto flex max-w-3xl flex-col gap-8 bg-white p-10 text-black print:p-0">
            <style>{`@media print { @page { margin: 16mm; } .no-print { display: none !important; } body { background: white !important; } }`}</style>
            <header className="flex items-start justify-between gap-4 border-black/10 border-b pb-6">
                <div>
                    <h1 className="font-bold text-2xl">{t("packingSlip")}</h1>
                    <p className="text-black/60 text-sm">
                        {t("issuedAt")}: {formatDateTime(new Date().toISOString(), locale)}
                    </p>
                </div>
                <div className="text-end">
                    <p className="font-semibold text-lg">#{formatNumber(order.orderNumber, locale)}</p>
                    <p className="text-black/60 text-sm">{formatDateTime(order.createdAt, locale)}</p>
                </div>
            </header>

            <section className="text-sm">
                <h3 className="mb-2 font-semibold text-xs uppercase tracking-wide">{t("shipTo")}</h3>
                <p className="font-medium">
                    {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                </p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p className="text-black/70">
                    {order.shippingAddress.city}
                    {order.shippingAddress.postcode ? ` · ${order.shippingAddress.postcode}` : ""} ·{" "}
                    {order.shippingAddress.country}
                </p>
                {order.shippingAddress.phone && <p className="text-black/70">{order.shippingAddress.phone}</p>}
            </section>

            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="border-black/20 border-b text-start">
                        <th className="py-2 text-start">{t("item")}</th>
                        <th className="py-2 text-end">{t("quantity")}</th>
                    </tr>
                </thead>
                <tbody>
                    {order.lineItems.map((line) => (
                        <tr key={line.id} className="border-black/5 border-b">
                            <td className="py-2">
                                <div className="font-medium">{line.name[locale]}</div>
                                {line.sku && <div className="font-mono text-black/60 text-xs">{line.sku}</div>}
                            </td>
                            <td className="py-2 text-end tabular-nums">{formatNumber(line.quantity, locale)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="no-print flex justify-end">
                <Button onClick={() => window.print()}>{t("print")}</Button>
            </div>
        </article>
    );
}
