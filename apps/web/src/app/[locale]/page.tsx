import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";
import { Link } from "#/lib/i18n/navigation";
import { formatPrice, getMoneyFormatConfig } from "#/lib/money";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    const t = await getTranslations("Home");
    const productsT = await getTranslations("Products");
    const api = await apiServer();
    const [{ data }, moneyConfig] = await Promise.all([
        api.storefront.GET("/api/v1/products", { params: { query: { limit: 8, featured: true } } }),
        getMoneyFormatConfig(),
    ]);
    const featured = data?.data ?? [];

    return (
        <section className="flex flex-col gap-12 py-12">
            <header className="flex flex-col items-start gap-6">
                <h1 className="text-balance font-bold text-4xl tracking-tight md:text-5xl">{t("heroTitle")}</h1>
                <p className="max-w-xl text-pretty text-lg text-muted-foreground">{t("heroBody")}</p>
                <Link
                    href="/products"
                    className="inline-flex items-center rounded-md bg-accent px-5 py-2.5 font-medium text-accent-foreground transition hover:opacity-90"
                >
                    {t("browseProducts")}
                </Link>
            </header>

            {featured.length > 0 && (
                <section className="flex flex-col gap-4">
                    <h2 className="font-semibold text-2xl">{productsT("title")}</h2>
                    <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                        {featured.map((product) => (
                            <li key={product.id} className="flex flex-col gap-2">
                                <Link href={`/products` as never} className="flex flex-col gap-2 hover:opacity-90">
                                    <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                                        {product.featured_image_url ? (
                                            // biome-ignore lint/performance/noImgElement: external picsum URLs avoid next/image remote-patterns
                                            <img
                                                src={product.featured_image_url}
                                                alt={product.name ?? product.sku ?? ""}
                                                className="size-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : null}
                                    </div>
                                    <span className="line-clamp-2 font-medium text-sm">{product.name ?? product.sku}</span>
                                    <span className="text-muted-foreground text-xs tabular-nums">
                                        {formatPrice(product.effective_price ?? product.regular_price, moneyConfig, locale)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </section>
    );
}

void getLocale;
