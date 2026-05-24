"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "#/components/ui/button";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import type { AdminOrder } from "#/lib/types";

interface InvoiceViewProps {
    order: AdminOrder;
    locale: Locale;
    autoPrint: boolean;
}

/**
 * Print-styled invoice. Server provides the order shape; the client triggers `window.print()` when
 * `?print=1` is in the URL. Layout is intentionally austere — body uses white, monospaced numbers
 * stay tabular, and the only on-screen chrome (the print button) is hidden by `@media print`.
 */
export function InvoiceView({ order, locale, autoPrint }: InvoiceViewProps) {
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
                    <h1 className="font-bold text-2xl">{t("invoice")}</h1>
                    <p className="text-black/60 text-sm">
                        {t("issuedAt")}: {formatDateTime(new Date().toISOString(), locale)}
                    </p>
                </div>
                <div className="text-end">
                    <p className="font-semibold text-lg">#{formatNumber(order.orderNumber, locale)}</p>
                    <p className="text-black/60 text-sm">{formatDateTime(order.createdAt, locale)}</p>
                </div>
            </header>

            <section className="grid grid-cols-2 gap-6 text-sm">
                <Address title={t("billTo")} address={order.billingAddress} />
                <Address title={t("shipTo")} address={order.shippingAddress} />
            </section>

            <table className="w-full border-collapse text-sm">
                <thead>
                    <tr className="border-black/20 border-b text-start">
                        <th className="py-2 text-start">{t("item")}</th>
                        <th className="py-2 text-end">{t("quantity")}</th>
                        <th className="py-2 text-end">{t("unit")}</th>
                        <th className="py-2 text-end">{t("total")}</th>
                    </tr>
                </thead>
                <tbody>
                    {order.lineItems.map((line) => (
                        <tr key={line.id} className="border-black/5 border-b align-top">
                            <td className="py-2">
                                <div className="font-medium">{line.name[locale]}</div>
                                {line.sku && <div className="font-mono text-black/60 text-xs">{line.sku}</div>}
                            </td>
                            <td className="py-2 text-end tabular-nums">{formatNumber(line.quantity, locale)}</td>
                            <td className="py-2 text-end tabular-nums">{formatMoney(line.unitPrice, locale)}</td>
                            <td className="py-2 text-end font-medium tabular-nums">{formatMoney(line.total, locale)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <aside className="ms-auto flex w-72 flex-col gap-1 text-sm">
                <Row label={t("subtotal")} value={formatMoney(order.itemsTotal, locale)} />
                <Row label={t("shipping")} value={formatMoney(order.shippingTotal, locale)} />
                <Row label={t("tax")} value={formatMoney(order.taxTotal, locale)} />
                {order.discountTotal > 0 && <Row label={t("discount")} value={`− ${formatMoney(order.discountTotal, locale)}`} />}
                <hr className="my-2 border-black/20" />
                <Row label={t("grandTotal")} value={formatMoney(order.grandTotal, locale)} emphasis />
            </aside>

            <p className="border-black/10 border-t pt-4 text-black/60 text-xs">{t("thankYou")}</p>

            <div className="no-print flex justify-end">
                <Button onClick={() => window.print()}>{t("print")}</Button>
            </div>
        </article>
    );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
    return (
        <div className={`flex justify-between ${emphasis ? "font-semibold text-base" : ""}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

function Address({ title, address }: { title: string; address: AdminOrder["billingAddress"] }) {
    return (
        <div>
            <h3 className="mb-2 font-semibold text-xs uppercase tracking-wide">{title}</h3>
            <p className="font-medium">
                {address.firstName} {address.lastName}
            </p>
            {address.company && <p>{address.company}</p>}
            <p>{address.addressLine1}</p>
            {address.addressLine2 && <p>{address.addressLine2}</p>}
            <p className="text-black/70">
                {address.city}
                {address.provinceCode ? ` · ${address.provinceCode}` : ""}
                {address.postcode ? ` · ${address.postcode}` : ""} · {address.country}
            </p>
            {address.phone && <p className="text-black/70">{address.phone}</p>}
        </div>
    );
}
