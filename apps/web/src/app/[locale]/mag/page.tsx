import { Clock3, Newspaper, Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listPublicContent } from "#/lib/content-api";
import { Link } from "#/lib/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Magazine" });
    return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function MagazinePage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ page?: string; q?: string }>;
}) {
    const { locale } = await params;
    const query = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: "Magazine" });
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const result = await listPublicContent(locale, { page, q: query.q });
    const numbers = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US");

    return (
        <section className="flex flex-col gap-8 py-8">
            <header className="max-w-3xl space-y-3">
                <div className="inline-flex items-center gap-2 text-accent text-sm">
                    <Newspaper className="size-4" />
                    {t("eyebrow")}
                </div>
                <h1 className="text-balance font-bold text-3xl tracking-tight md:text-4xl">{t("title")}</h1>
                <p className="text-pretty text-muted-foreground leading-7">{t("description")}</p>
            </header>
            <search>
                <form method="get" className="flex max-w-xl gap-2">
                    <label className="sr-only" htmlFor="magazine-search">
                        {t("search")}
                    </label>
                    <input
                        id="magazine-search"
                        name="q"
                        defaultValue={query.q ?? ""}
                        className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder={t("searchPlaceholder")}
                    />
                    <button
                        type="submit"
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
                    >
                        <Search className="size-4" />
                        {t("search")}
                    </button>
                </form>
            </search>
            {result.data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{t("empty")}</div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {result.data.map((post) => (
                        <article
                            key={post.id}
                            className="overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                            <Link href={`/mag/${post.slug}` as never} className="block">
                                {post.featured_media_url ? (
                                    // biome-ignore lint/performance/noImgElement: media URLs are tenant-controlled and may use dynamic remote hosts
                                    <img
                                        src={post.featured_media_url}
                                        alt={post.featured_media_alt || post.title}
                                        className="aspect-video w-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="grid aspect-video place-items-center bg-muted">
                                        <Newspaper className="size-8 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="space-y-3 p-5">
                                    <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
                                        <span>{post.type === "news" ? t("news") : t("post")}</span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock3 className="size-3.5" />
                                            {numbers.format(post.reading_time_minutes)} {t("minutes")}
                                        </span>
                                    </div>
                                    <h2 className="line-clamp-2 font-semibold text-lg leading-7">{post.title}</h2>
                                    <p className="line-clamp-3 text-muted-foreground text-sm leading-6">
                                        {post.excerpt || t("fallbackExcerpt")}
                                    </p>
                                </div>
                            </Link>
                        </article>
                    ))}
                </div>
            )}
            {result.meta.last_page > 1 ? (
                <nav className="flex items-center justify-center gap-3" aria-label={t("pagination")}>
                    <Link
                        href={`/mag?page=${Math.max(1, page - 1)}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}` as never}
                        aria-disabled={page <= 1}
                        className={`rounded-md border px-4 py-2 text-sm ${page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}
                    >
                        {t("previous")}
                    </Link>
                    <span className="text-muted-foreground text-sm">
                        {numbers.format(page)} / {numbers.format(result.meta.last_page)}
                    </span>
                    <Link
                        href={
                            `/mag?page=${Math.min(result.meta.last_page, page + 1)}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}` as never
                        }
                        aria-disabled={page >= result.meta.last_page}
                        className={`rounded-md border px-4 py-2 text-sm ${page >= result.meta.last_page ? "pointer-events-none opacity-50" : "hover:bg-muted"}`}
                    >
                        {t("next")}
                    </Link>
                </nav>
            ) : null}
        </section>
    );
}
