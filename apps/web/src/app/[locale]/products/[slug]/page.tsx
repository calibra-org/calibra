import type { StorefrontSchemas } from "@calibra/sdk";
import { BadgeCheck, Boxes, PackageCheck, Ruler, Scale, Tags } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";
import { Link } from "#/lib/i18n/navigation";
import { formatPrice, getMoneyFormatConfig } from "#/lib/money";
import { getPublicSeoEntity } from "#/lib/seo-api";

type ProductDetail = StorefrontSchemas["schemas"]["ProductDetail"];

interface PageProps {
    params: Promise<{ locale: string; slug: string }>;
}

async function getProduct(slug: string): Promise<ProductDetail | null> {
    const api = await apiServer();
    const { data, response } = await api.storefront.GET("/api/v1/products/{slug}", {
        params: { path: { slug } },
    });
    if (response.status === 404) return null;
    return data?.data ?? null;
}

function plainText(value: string | null | undefined): string {
    return String(value ?? "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, slug } = await params;
    const product = await getProduct(slug);
    if (!product) return {};
    const seo = await getPublicSeoEntity("product", product.id, locale);
    const title = seo?.title || product.name || product.sku || undefined;
    const description =
        seo?.description || plainText(product.short_description || product.description).slice(0, 320) || undefined;
    const image = product.featured_image_url || product.images?.[0]?.url || undefined;
    return {
        title,
        description,
        alternates: seo?.canonical_url ? { canonical: seo.canonical_url } : undefined,
        robots: {
            index: seo?.robots_index ?? true,
            follow: seo?.robots_follow ?? true,
        },
        openGraph: {
            title: seo?.og_title || title,
            description: seo?.og_description || description,
            type: "website",
            images: image ? [{ url: image, alt: product.images?.[0]?.alt || product.name || product.sku || "" }] : undefined,
        },
    };
}

export default async function ProductDetailPage({ params }: PageProps) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    const [product, t, moneyConfig] = await Promise.all([
        getProduct(slug),
        getTranslations({ locale, namespace: "ProductDetail" }),
        getMoneyFormatConfig(),
    ]);
    if (!product) notFound();
    const seo = await getPublicSeoEntity("product", product.id, locale);
    const images = product.images?.filter((image) => Boolean(image.url)) ?? [];
    const primaryImage = product.featured_image_url || images[0]?.url || null;
    const description = plainText(product.description || product.short_description);
    const dimensions = [product.length_mm, product.width_mm, product.height_mm].filter(
        (value): value is number => typeof value === "number",
    );

    return (
        <article className="flex flex-col gap-10 py-8">
            {seo?.schema ? (
                <Script id={`product-schema-${product.id}`} type="application/ld+json">
                    {JSON.stringify(seo.schema).replace(/</g, "\\u003c")}
                </Script>
            ) : null}

            <nav aria-label={t("breadcrumb")} className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                <Link href="/products" className="transition hover:text-foreground">
                    {t("products")}
                </Link>
                <span aria-hidden="true">/</span>
                <span className="text-foreground">{product.name || product.sku}</span>
            </nav>

            <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
                <div className="space-y-4">
                    <div className="aspect-square overflow-hidden rounded-3xl border bg-muted">
                        {primaryImage ? (
                            // biome-ignore lint/performance/noImgElement: tenant media can use dynamic remote hosts
                            <img
                                src={primaryImage}
                                alt={images[0]?.alt || product.name || product.sku || ""}
                                className="size-full object-cover"
                            />
                        ) : (
                            <div className="grid size-full place-items-center text-muted-foreground">
                                <Boxes className="size-16" aria-hidden="true" />
                            </div>
                        )}
                    </div>
                    {images.length > 1 ? (
                        <div className="grid grid-cols-4 gap-3">
                            {images.slice(0, 8).map((image) => (
                                <div key={image.id} className="aspect-square overflow-hidden rounded-xl border bg-muted">
                                    {/* biome-ignore lint/performance/noImgElement: tenant media can use dynamic remote hosts */}
                                    <img
                                        src={image.url ?? ""}
                                        alt={image.alt || product.name || ""}
                                        className="size-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            {product.brands?.map((brand) => (
                                <span key={brand.id} className="rounded-full border bg-card px-3 py-1 text-muted-foreground">
                                    {brand.name}
                                </span>
                            ))}
                            {product.featured ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
                                    <BadgeCheck className="size-4" />
                                    {t("featured")}
                                </span>
                            ) : null}
                        </div>
                        <h1 className="text-balance font-bold text-3xl leading-tight tracking-tight md:text-5xl">
                            {product.name || product.sku}
                        </h1>
                        {product.short_description ? (
                            <p className="text-pretty text-lg text-muted-foreground leading-8">
                                {plainText(product.short_description)}
                            </p>
                        ) : null}
                    </div>

                    <div className="rounded-2xl border bg-card p-5">
                        <p className="text-muted-foreground text-sm">{t("price")}</p>
                        <p className="mt-2 font-bold text-3xl tabular-nums">
                            {formatPrice(product.effective_price ?? product.regular_price, moneyConfig, locale)}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                            <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                                <PackageCheck className="size-4 text-accent" />
                                {t("published")}
                            </span>
                            {product.sku ? (
                                <span className="rounded-lg border px-3 py-2 text-muted-foreground">
                                    {t("sku")}: <span className="font-medium text-foreground">{product.sku}</span>
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <dl className="grid gap-3 sm:grid-cols-2">
                        {typeof product.weight_grams === "number" ? (
                            <div className="rounded-2xl border bg-card p-4">
                                <dt className="flex items-center gap-2 text-muted-foreground text-sm">
                                    <Scale className="size-4" />
                                    {t("weight")}
                                </dt>
                                <dd className="mt-2 font-semibold tabular-nums">
                                    {product.weight_grams.toLocaleString(locale)} {t("gram")}
                                </dd>
                            </div>
                        ) : null}
                        {dimensions.length > 0 ? (
                            <div className="rounded-2xl border bg-card p-4">
                                <dt className="flex items-center gap-2 text-muted-foreground text-sm">
                                    <Ruler className="size-4" />
                                    {t("dimensions")}
                                </dt>
                                <dd className="mt-2 font-semibold tabular-nums">
                                    {dimensions.join(" × ")} {t("millimeter")}
                                </dd>
                            </div>
                        ) : null}
                        {product.categories && product.categories.length > 0 ? (
                            <div className="rounded-2xl border bg-card p-4 sm:col-span-2">
                                <dt className="flex items-center gap-2 text-muted-foreground text-sm">
                                    <Tags className="size-4" />
                                    {t("categories")}
                                </dt>
                                <dd className="mt-2 flex flex-wrap gap-2">
                                    {product.categories.map((category) => (
                                        <span key={category.id} className="rounded-md bg-muted px-2.5 py-1 text-sm">
                                            {category.name}
                                        </span>
                                    ))}
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </div>
            </section>

            {description ? (
                <section className="rounded-3xl border bg-card p-6 md:p-8">
                    <h2 className="font-bold text-2xl">{t("description")}</h2>
                    <p className="mt-4 whitespace-pre-line text-pretty text-foreground/85 leading-8">{description}</p>
                </section>
            ) : null}

            {product.variations && product.variations.length > 0 ? (
                <section className="rounded-3xl border bg-card p-6 md:p-8">
                    <h2 className="font-bold text-2xl">{t("variations")}</h2>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {product.variations.map((variation) => (
                            <div key={variation.id} className="rounded-2xl border p-4">
                                <p className="font-medium">{variation.sku || `${t("variation")} ${variation.id}`}</p>
                                <p className="mt-2 text-muted-foreground text-sm tabular-nums">
                                    {formatPrice(variation.effective_price ?? variation.regular_price, moneyConfig, locale)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
        </article>
    );
}
