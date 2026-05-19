import { getTranslations, setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function CartPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Cart");

    const api = await apiServer();
    const { data } = await api.storefront.GET("/api/v1/cart", {});
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
                                        {item.quantity} × {formatRial(item.price, locale)}
                                    </span>
                                </div>
                                <span className="font-medium text-sm tabular-nums">{formatRial(item.total, locale)}</span>
                            </li>
                        ))}
                    </ul>
                    {cart?.totals ? (
                        <dl className="flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm">
                            <Row label="Items" value={formatRial(cart.totals.items_total, locale)} />
                            <Row label="Shipping" value={formatRial(cart.totals.shipping_total, locale)} />
                            <Row label="Tax" value={formatRial(cart.totals.tax_total, locale)} />
                            <Row label="Total" value={formatRial(cart.totals.grand_total, locale)} bold />
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

function formatRial(value: number | null | undefined, locale: string): string {
    if (value === null || value === undefined) return "";
    return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
}
