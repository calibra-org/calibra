import { NextResponse } from "next/server";

import { proxyPublicSeoDocument } from "#/lib/seo-api";

export async function GET() {
    try {
        const upstream = await proxyPublicSeoDocument("/api/v1/seo/robots");
        if (!upstream.ok) throw new Error(`SEO robots API returned ${upstream.status}`);
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                "content-type": "text/plain; charset=utf-8",
                "cache-control": upstream.headers.get("cache-control") || "public, max-age=300, stale-while-revalidate=3600",
            },
        });
    } catch {
        return new NextResponse("User-agent: *\nAllow: /\n", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
    }
}

export const HEAD = GET;
