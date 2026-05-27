import { getTranslations, setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function ProductsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Products");

    const api = await apiServer();
    const { data } = await api.storefront.GET("/api/v1/products", {
        params: { query: { limit: 24 } },
    });
    const products = data?.data ?? [];

    return (
        <section className="flex flex-col gap-6 py-12">
            <h1 className="font-bold text-3xl tracking-tight">{t("title")}</h1>
            {products.length === 0 ? (
                <p className="text-muted-foreground">{t("empty")}</p>
            ) : (
                <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                    {products.map((product) => (
                        <li key={product.id} className="flex flex-col gap-2">
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
                                {formatRial(product.effective_price ?? product.regular_price, locale)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function formatRial(value: number | null | undefined, locale: string): string {
    if (value === null || value === undefined) return "";
    return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
}
