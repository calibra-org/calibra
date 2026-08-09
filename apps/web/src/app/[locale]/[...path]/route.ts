import { NextResponse } from "next/server";

import { resolvePublicSeoRedirect } from "#/lib/seo-api";

export async function GET(request: Request, { params }: { params: Promise<{ locale: string; path: string[] }> }) {
    const { locale, path } = await params;
    const localePrefix = locale === "fa" ? "/fa" : "";
    const sourcePath = `${localePrefix}/${path.map(encodeURIComponent).join("/")}`;
    const redirect = await resolvePublicSeoRedirect(sourcePath);
    if (!redirect) return new NextResponse("Not Found", { status: 404 });
    if (redirect.status_code === 410 || !redirect.target_path) {
        return new NextResponse("Gone", {
            status: 410,
            headers: { "cache-control": "public, max-age=300" },
        });
    }
    return NextResponse.redirect(new URL(redirect.target_path, request.url), redirect.status_code);
}

export const HEAD = GET;
