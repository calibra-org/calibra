import "server-only";

import { headers } from "next/headers";

import { TENANT_HEADER } from "#/lib/tenant/constants";

export interface PublicContentCard {
    id: number;
    type: "article" | "news" | "guide" | "case_study" | "landing";
    locale: string;
    title: string;
    slug: string;
    excerpt: string | null;
    published_at: string | null;
    updated_at: string;
    reading_time_minutes: number;
    featured_media_url: string | null;
    featured_media_alt: string | null;
}

export interface PublicContentDetail extends PublicContentCard {
    content_html: string;
    seo_title: string | null;
    meta_description: string | null;
    canonical_url: string | null;
    robots_index: boolean;
    robots_follow: boolean;
    schema_type: "Article" | "BlogPosting" | "NewsArticle";
    focus_keyword: string | null;
    featured_media: { id: number | null; url: string; alt: string | null } | null;
    categories: Array<{ id: number; name: string; slug: string }>;
    tags: Array<{ id: number; name: string; slug: string }>;
    products: Array<{ id: number; name: string | null; slug: string | null; sku: string | null; relation_type?: string }>;
}

export interface PublicContentPage {
    data: PublicContentCard[];
    meta: { page: number; limit: number; total: number; last_page: number };
}

function apiBase(): string {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333").replace(/\/$/, "");
}

async function tenantHeaders(): Promise<Record<string, string>> {
    const requestHeaders = await headers();
    const tenant = requestHeaders.get(TENANT_HEADER);
    return tenant ? { [TENANT_HEADER]: tenant } : {};
}

export async function listPublicContent(
    locale: string,
    options: { page?: number; type?: string; q?: string } = {},
): Promise<PublicContentPage> {
    const query = new URLSearchParams({ locale, page: String(options.page ?? 1), limit: "12" });
    if (options.type) query.set("type", options.type);
    if (options.q) query.set("q", options.q);
    const response = await fetch(`${apiBase()}/api/v1/content/posts?${query.toString()}`, {
        headers: { accept: "application/json", "accept-language": locale, ...(await tenantHeaders()) },
        cache: "no-store",
    });
    if (!response.ok) return { data: [], meta: { page: 1, limit: 12, total: 0, last_page: 1 } };
    return (await response.json()) as PublicContentPage;
}

export async function getPublicContent(locale: string, slug: string): Promise<PublicContentDetail | null> {
    const response = await fetch(
        `${apiBase()}/api/v1/content/posts/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
        {
            headers: { accept: "application/json", "accept-language": locale, ...(await tenantHeaders()) },
            cache: "no-store",
        },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`content API returned ${response.status}`);
    const payload = (await response.json()) as { data: PublicContentDetail };
    return payload.data;
}

export function publicContentApiBase(): string {
    return apiBase();
}
