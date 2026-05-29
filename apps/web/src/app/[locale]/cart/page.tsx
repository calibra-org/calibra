import { getTranslations, setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";
import { formatPrice, getMoneyFormatConfig } from "#/lib/money";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function CartPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Cart");

    const api = await apiServer();
    const [{ data }, moneyConfig] = await Promise.all([api.storefront.GET("/api/v1/cart", {}), getMoneyFormatConfig()]);
    const cart = data?.data;
    const items = cart?.items ?? [];

    return (
        <section className="flex flex-col gap-6 py-12">
            <h1 className="font-bold text-3xl tracking-tight">{t("title")}</h1>
            {items.length === 0 ? (
                <p className="text-muted-foreground">{t("empty")}</p>
            ) : (
                <div className="flex flex-col gap-4">
                    <ul className="flex flex-col divide-y rounded-lg border">
                        {items.map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{item.name ?? item.sku ?? ""}</span>
                                    <span className="text-muted-foreground text-xs">
                                        {item.quantity} × {formatPrice(item.price, moneyConfig, locale)}
                                    </span>
                                </div>
                                <span className="font-medium text-sm tabular-nums">
                                    {formatPrice(item.total, moneyConfig, locale)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {cart?.totals ? (
                        <dl className="flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm">
                            <Row label="Items" value={formatPrice(cart.totals.items_total, moneyConfig, locale)} />
                            <Row label="Shipping" value={formatPrice(cart.totals.shipping_total, moneyConfig, locale)} />
                            <Row label="Tax" value={formatPrice(cart.totals.tax_total, moneyConfig, locale)} />
                            <Row label="Total" value={formatPrice(cart.totals.grand_total, moneyConfig, locale)} bold />
                        </dl>
                    ) : null}
                </div>
            )}
        </section>
    );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className={`flex items-center justify-between ${bold ? "font-semibold" : ""}`}>
            <dt>{label}</dt>
            <dd className="tabular-nums">{value}</dd>
        </div>
    );
}
