// biome-ignore-all lint/security/noDangerouslySetInnerHtml: Content HTML is sanitized by the API on every create, update, and AI-draft write path before persistence.

import { Clock3, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ContentViewTracker } from "#/components/content/content-view-tracker";
import { ProductContentLink } from "#/components/content/product-content-link";
import { getPublicContent } from "#/lib/content-api";
import { getPublicSeoEntity } from "#/lib/seo-api";

interface PageProps {
    params: Promise<{ locale: string; slug: string }>;
}

function SanitizedArticleContent({ html }: { html: string }) {
    return (
        <div
            className="min-w-0 overflow-x-auto text-base text-foreground leading-8 content-body [&_a]:text-accent [&_a]:underline [&_blockquote]:border-border [&_blockquote]:border-s-4 [&_blockquote]:ps-4 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-bold [&_h2]:text-2xl [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-semibold [&_h3]:text-xl [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-xl [&_li]:my-2 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:my-5 [&_pre]:overflow-x-auto [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-3 [&_th]:border [&_th]:bg-muted [&_th]:p-3 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:ps-6"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, slug } = await params;
    const post = await getPublicContent(locale, slug);
    if (!post) return {};
    const seo = await getPublicSeoEntity("content_post", post.id, locale);
    const title = seo?.title || post.seo_title || post.title;
    const description = seo?.description || post.meta_description || post.excerpt || undefined;
    return {
        title,
        description,
        alternates:
            seo?.canonical_url || post.canonical_url
                ? { canonical: seo?.canonical_url || post.canonical_url || undefined }
                : undefined,
        robots: { index: seo?.robots_index ?? post.robots_index, follow: seo?.robots_follow ?? post.robots_follow },
        openGraph: {
            title: seo?.og_title || title,
            description: seo?.og_description || description,
            type: "article",
            publishedTime: post.published_at || undefined,
            images: post.featured_media?.url
                ? [{ url: post.featured_media.url, alt: post.featured_media.alt || post.title }]
                : undefined,
        },
    };
}

export default async function MagazineDetailPage({ params }: PageProps) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    const [post, t] = await Promise.all([getPublicContent(locale, slug), getTranslations({ locale, namespace: "Magazine" })]);
    if (!post) notFound();
    const seo = await getPublicSeoEntity("content_post", post.id, locale);
    const formatter = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "long" });
    const numbers = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US");
    const schema = seo?.schema || {
        "@context": "https://schema.org",
        "@type": post.schema_type,
        headline: post.title,
        description: post.meta_description || post.excerpt || undefined,
        datePublished: post.published_at || undefined,
        dateModified: post.updated_at || undefined,
        image: post.featured_media?.url ? [post.featured_media.url] : undefined,
        mainEntityOfPage: post.canonical_url || undefined,
    };

    return (
        <article className="mx-auto flex max-w-4xl flex-col gap-8 py-8">
            <ContentViewTracker postId={post.id} />
            <Script id={`content-schema-${post.id}`} type="application/ld+json">
                {JSON.stringify(schema).replace(/</g, "\\u003c")}
            </Script>
            <header className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    {post.categories.map((category) => (
                        <span key={category.id} className="rounded-full bg-muted px-3 py-1 text-xs">
                            {category.name}
                        </span>
                    ))}
                </div>
                <h1 className="text-balance font-bold text-3xl leading-tight tracking-tight md:text-5xl">{post.title}</h1>
                {post.excerpt ? <p className="text-pretty text-lg text-muted-foreground leading-8">{post.excerpt}</p> : null}
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
                    <span>{post.published_at ? formatter.format(new Date(post.published_at)) : ""}</span>
                    <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-4" />
                        {numbers.format(post.reading_time_minutes)} {t("readTime")}
                    </span>
                </div>
            </header>
            {post.featured_media ? (
                // biome-ignore lint/performance/noImgElement: media URLs are tenant-controlled and may use dynamic remote hosts
                <img
                    src={post.featured_media.url}
                    alt={post.featured_media.alt || post.title}
                    className="aspect-video w-full rounded-2xl object-cover"
                />
            ) : null}
            <SanitizedArticleContent html={post.content_html} />
            {post.products.length > 0 ? (
                <section className="rounded-2xl border bg-card p-5">
                    <div className="flex items-center gap-2">
                        <PackageSearch className="size-5 text-accent" />
                        <h2 className="font-semibold text-xl">{t("relatedProducts")}</h2>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {post.products.map((product) => (
                            <ProductContentLink
                                key={product.id}
                                postId={post.id}
                                productId={product.id}
                                productSlug={product.slug}
                            >
                                <span className="flex items-center justify-between rounded-lg border p-4 transition hover:bg-muted/50">
                                    <span className="font-medium text-sm">
                                        {product.name || product.sku || `${t("product")} ${product.id}`}
                                    </span>
                                    <span className="text-accent text-sm">{t("viewProducts")}</span>
                                </span>
                            </ProductContentLink>
                        ))}
                    </div>
                </section>
            ) : null}
            {post.tags.length > 0 ? (
                <footer className="flex flex-wrap gap-2 border-t pt-5">
                    {post.tags.map((tag) => (
                        <span key={tag.id} className="rounded-md border px-2.5 py-1 text-muted-foreground text-xs">
                            #{tag.name}
                        </span>
                    ))}
                </footer>
            ) : null}
        </article>
    );
}
