import { getTranslations, setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";
import { Link } from "#/lib/i18n/navigation";
import { formatPrice, getMoneyFormatConfig } from "#/lib/money";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function ProductsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Products");

    const api = await apiServer();
    const [{ data }, moneyConfig] = await Promise.all([
        api.storefront.GET("/api/v1/products", { params: { query: { limit: 24 } } }),
        getMoneyFormatConfig(),
    ]);
    const products = data?.data ?? [];

    return (
        <section className="flex flex-col gap-6 py-12">
            <h1 className="font-bold text-3xl tracking-tight">{t("title")}</h1>
            {products.length === 0 ? (
                <p className="text-muted-foreground">{t("empty")}</p>
            ) : (
                <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                    {products.map((product) => (
                        <li key={product.id}>
                            <Link
                                href={product.slug ? `/products/${product.slug}` : "/products"}
                                className="group flex flex-col gap-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent"
                            >
                                <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                                    {product.featured_image_url ? (
                                        // biome-ignore lint/performance/noImgElement: tenant media can use dynamic remote hosts
                                        <img
                                            src={product.featured_image_url}
                                            alt={product.name ?? product.sku ?? ""}
                                            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                            loading="lazy"
                                        />
                                    ) : null}
                                </div>
                                <span className="line-clamp-2 font-medium text-sm transition group-hover:text-accent">
                                    {product.name ?? product.sku}
                                </span>
                                <span className="text-muted-foreground text-xs tabular-nums">
                                    {formatPrice(product.effective_price ?? product.regular_price, moneyConfig, locale)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
