import { NextResponse } from "next/server";

import { proxyPublicSeoDocument } from "#/lib/seo-api";

const EMPTY_SITEMAP =
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';

export async function GET() {
    try {
        const upstream = await proxyPublicSeoDocument("/api/v1/seo/sitemap.xml");
        if (!upstream.ok) throw new Error(`SEO sitemap API returned ${upstream.status}`);
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                "content-type": "application/xml; charset=utf-8",
                "cache-control": upstream.headers.get("cache-control") || "public, max-age=300, stale-while-revalidate=3600",
            },
        });
    } catch {
        return new NextResponse(EMPTY_SITEMAP, {
            status: 200,
            headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" },
        });
    }
}

export const HEAD = GET;
