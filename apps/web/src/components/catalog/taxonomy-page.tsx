import type { StorefrontSchemas } from "@calibra/sdk";
import { Boxes, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { getTranslations } from "next-intl/server";

import { apiServer } from "#/lib/api";
import { Link } from "#/lib/i18n/navigation";
import { formatPrice, getMoneyFormatConfig } from "#/lib/money";
import { getPublicSeoEntity } from "#/lib/seo-api";

type Category = StorefrontSchemas["schemas"]["Category"];
type Brand = StorefrontSchemas["schemas"]["Brand"];
type Taxonomy = Category | Brand;

export type TaxonomyKind = "category" | "brand";

async function getTaxonomy(kind: TaxonomyKind, slug: string): Promise<Taxonomy | null> {
    const api = await apiServer();
    if (kind === "category") {
        const { data, response } = await api.storefront.GET("/api/v1/categories/{slug}", {
            params: { path: { slug } },
        });
        if (response.status === 404) return null;
        return data?.data ?? null;
    }
    const { data } = await api.storefront.GET("/api/v1/brands");
    return data?.data.find((item) => item.slug === slug) ?? null;
}

async function getProducts(kind: TaxonomyKind, slug: string) {
    const api = await apiServer();
    const query = kind === "category" ? { category: slug, limit: 48 } : { brand: slug, limit: 48 };
    const { data } = await api.storefront.GET("/api/v1/products", { params: { query } });
    return data?.data ?? [];
}

export async function generateTaxonomyMetadata(kind: TaxonomyKind, locale: string, slug: string): Promise<Metadata> {
    const taxonomy = await getTaxonomy(kind, slug);
    if (!taxonomy) return {};
    const seo = await getPublicSeoEntity(kind, taxonomy.id, locale);
    const title = seo?.title || taxonomy.name || undefined;
    const description = seo?.description || taxonomy.description || undefined;
    return {
        title,
        description,
        alternates: seo?.canonical_url ? { canonical: seo.canonical_url } : undefined,
        robots: { index: seo?.robots_index ?? true, follow: seo?.robots_follow ?? true },
        openGraph: {
            title: seo?.og_title || title,
            description: seo?.og_description || description,
            type: "website",
        },
    };
}

export async function TaxonomyPage({ kind, locale, slug }: { kind: TaxonomyKind; locale: string; slug: string }) {
    const [taxonomy, products, moneyConfig, t] = await Promise.all([
        getTaxonomy(kind, slug),
        getProducts(kind, slug),
        getMoneyFormatConfig(),
        getTranslations({ locale, namespace: "Taxonomy" }),
    ]);
    if (!taxonomy) notFound();
    const seo = await getPublicSeoEntity(kind, taxonomy.id, locale);

    return (
        <section className="flex flex-col gap-8 py-8">
            {seo?.schema ? (
                <Script id={`${kind}-schema-${taxonomy.id}`} type="application/ld+json">
                    {JSON.stringify(seo.schema).replace(/</g, "\\u003c")}
                </Script>
            ) : null}
            <nav aria-label={t("breadcrumb")} className="flex items-center gap-2 text-muted-foreground text-sm">
                <Link href="/products" className="transition hover:text-foreground">
                    {t("products")}
                </Link>
                <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
                <span className="text-foreground">{taxonomy.name}</span>
            </nav>
            <header className="rounded-3xl border bg-card p-6 md:p-8">
                <p className="text-accent text-sm">{kind === "category" ? t("category") : t("brand")}</p>
                <h1 className="mt-2 text-balance font-bold text-3xl tracking-tight md:text-5xl">{taxonomy.name}</h1>
                {taxonomy.description ? (
                    <p className="mt-4 max-w-3xl text-pretty text-muted-foreground leading-8">{taxonomy.description}</p>
                ) : null}
            </header>
            {products.length === 0 ? (
                <div className="grid min-h-56 place-items-center rounded-3xl border border-dashed text-center text-muted-foreground">
                    <div>
                        <Boxes className="mx-auto size-10 opacity-60" aria-hidden="true" />
                        <p className="mt-3 text-sm">{t("empty")}</p>
                    </div>
                </div>
            ) : (
                <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                    {products.map((product) => (
                        <li key={product.id}>
                            <Link
                                href={product.slug ? `/products/${product.slug}` : "/products"}
                                className="group flex flex-col gap-2"
                            >
                                <div className="aspect-square overflow-hidden rounded-2xl border bg-muted">
                                    {product.featured_image_url ? (
                                        // biome-ignore lint/performance/noImgElement: tenant media can use dynamic remote hosts
                                        <img
                                            src={product.featured_image_url}
                                            alt={product.name || product.sku || ""}
                                            loading="lazy"
                                            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                        />
                                    ) : null}
                                </div>
                                <p className="line-clamp-2 font-medium text-sm transition group-hover:text-accent">
                                    {product.name || product.sku}
                                </p>
                                <p className="text-muted-foreground text-xs tabular-nums">
                                    {formatPrice(product.effective_price ?? product.regular_price, moneyConfig, locale)}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
