import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hasLocale } from "next-intl";

import { CSRF_COOKIE, getSession, SESSION_COOKIE } from "#/lib/auth";
import { routing } from "#/lib/i18n/routing";

interface RouteContext {
    params: Promise<{ path: string[] }>;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Same-origin proxy to the AdonisJS admin API. The browser only ever sees `/api/admin/...`; the
 * httpOnly `admin_session` cookie is read on the server and forwarded as a bearer token, so the
 * token never reaches client JavaScript.
 *
 * Mutations (POST/PUT/PATCH/DELETE) require a matching `X-CSRF-Token` header — a double-submit
 * cookie pattern with the `admin_csrf` cookie that `loginAction` sets. With SameSite=Lax on the
 * session cookie this is defense-in-depth (cross-origin POSTs from a malicious page already drop
 * cookies), but the explicit check survives any future cookie-policy regressions.
 *
 * - Missing or malformed session → 401, no upstream call.
 * - Upstream 401 → cookie is cleared so the next page render bounces the user to `/login`, and the
 *   401 is propagated so the React Query hook surfaces it.
 * - `Accept-Language` is forwarded from the incoming request (client hooks set it from
 *   `useLocale()`); falls back to the admin's default locale when absent.
 */
async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
    const session = await getSession();
    if (session === null) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const method = request.method;
    if (MUTATION_METHODS.has(method)) {
        const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
        const headerToken = request.headers.get("x-csrf-token");
        if (
            typeof cookieToken !== "string" ||
            cookieToken.length === 0 ||
            typeof headerToken !== "string" ||
            headerToken !== cookieToken
        ) {
            return Response.json({ error: "csrf_invalid" }, { status: 403 });
        }
    }

    const { path } = await context.params;
    const upstreamBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof upstreamBase !== "string" || upstreamBase.length === 0) {
        return Response.json({ error: "api_base_url_missing" }, { status: 500 });
    }

    const search = request.nextUrl.search;
    const upstreamUrl = `${upstreamBase.replace(/\/+$/, "")}/api/v1/admin/${path.join("/")}${search}`;
    const locale = resolveLocale(request.headers.get("accept-language"));

    const init: RequestInit & { duplex?: "half" } = {
        method,
        headers: buildUpstreamHeaders(session.token, locale, request.headers.get("content-type"), method),
        cache: "no-store",
    };

    if (MUTATION_METHODS.has(method)) {
        const body = await request.arrayBuffer();
        if (body.byteLength > 0) {
            init.body = body;
            init.duplex = "half";
        }
    }

    const upstream = await fetch(upstreamUrl, init);

    /**
     * Only wipe the session on 401 (the session bearer is no longer accepted by the api). 403
     * means "authenticated, can't have THIS resource" — could be a per-row bouncer denial,
     * a stale signed download token, or a non-admin role hitting an admin route. Clearing the
     * session on a 403 cascades: one bad token tears down the whole admin login, which is
     * exactly what happens on a stale export download URL.
     */
    if (upstream.status === 401) {
        const store = await cookies();
        store.delete(SESSION_COOKIE);
        store.delete(CSRF_COOKIE);
    }

    const responseHeaders = new Headers();
    /**
     * Pass through the small set of response headers downstream needs to render binary blobs
     * correctly (file downloads). `content-disposition` carries the suggested filename; without
     * it the browser falls back to the URL path. `content-length` is preserved so the browser's
     * progress bar works on the export download.
     */
    for (const key of ["content-type", "content-disposition", "content-length"]) {
        const value = upstream.headers.get(key);
        if (value !== null) responseHeaders.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

function buildUpstreamHeaders(token: string, locale: string, contentType: string | null, method: string): Record<string, string> {
    const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        "accept-language": locale,
        accept: "application/json",
    };
    if (MUTATION_METHODS.has(method) && typeof contentType === "string" && contentType.length > 0) {
        headers["content-type"] = contentType;
    }
    return headers;
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

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
