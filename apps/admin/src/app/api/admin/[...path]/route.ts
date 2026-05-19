import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hasLocale } from "next-intl";

import { getSession, SESSION_COOKIE } from "#/lib/auth";
import { routing } from "#/lib/i18n/routing";

interface RouteContext {
    params: Promise<{ path: string[] }>;
}

/**
 * Same-origin proxy to the AdonisJS admin API. The browser only ever sees `/api/admin/...`; the
 * httpOnly `admin_session` cookie is read on the server and forwarded as a bearer token, so the
 * token never reaches client JavaScript.
 *
 * - Missing or malformed session → 401, no upstream call.
 * - Upstream 401 → cookie is cleared so the next page render bounces the user to `/login`, and the
 *   401 is propagated so the React Query hook surfaces it.
 * - `Accept-Language` is forwarded from the incoming request (client hooks set it from
 *   `useLocale()`); falls back to the admin's default locale when absent.
 *
 * Scoped to GET in this PR — POST/PATCH/DELETE need CSRF thinking and the SDK's mutation surface,
 * deferred to a follow-up.
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const session = await getSession();
    if (session === null) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const { path } = await context.params;
    const upstreamBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof upstreamBase !== "string" || upstreamBase.length === 0) {
        return Response.json({ error: "api_base_url_missing" }, { status: 500 });
    }

    const search = request.nextUrl.search;
    const upstreamUrl = `${upstreamBase.replace(/\/+$/, "")}/api/v1/admin/${path.join("/")}${search}`;
    const locale = resolveLocale(request.headers.get("accept-language"));

    const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
            authorization: `Bearer ${session.token}`,
            "accept-language": locale,
            accept: "application/json",
        },
        cache: "no-store",
    });

    if (upstream.status === 401 || upstream.status === 403) {
        const store = await cookies();
        store.delete(SESSION_COOKIE);
    }

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType !== null) responseHeaders.set("content-type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

/**
 * Picks the first tag from a comma-separated `Accept-Language` value (drops `q=` weights) and
 * validates it against the configured locale list. Falls back to the admin's default locale when
 * the header is missing, malformed, or carries a locale we don't ship.
 */
function resolveLocale(header: string | null): string {
    if (header === null) return routing.defaultLocale;
    const primary = header.split(",")[0]?.split(";")[0]?.trim() ?? "";
    return hasLocale(routing.locales, primary) ? primary : routing.defaultLocale;
}
