import type { NextRequest } from "next/server";
import { hasLocale } from "next-intl";

import { CSRF_COOKIE, getSession, SESSION_COOKIE } from "#/lib/auth";
import { routing } from "#/lib/i18n/routing";

interface RouteContext {
    params: Promise<{ path: string[] }>;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Same-origin proxy to the AdonisJS control-plane API. The browser only ever sees `/api/platform/…`;
 * the httpOnly `platform_session` cookie is read on the server and forwarded as a `pat_` bearer, so
 * the token never reaches client JavaScript. No tenant header — the control plane is global.
 *
 * Mutations (POST/PUT/PATCH/DELETE) require a matching `X-CSRF-Token` header (double-submit with the
 * `platform_csrf` cookie that `loginAction` sets). Upstream 401 clears the session cookie so the next
 * render bounces to `/login`.
 */
function resolveLocale(header: string | null): string {
    const first = header?.split(",")[0]?.split("-")[0]?.trim();
    return first && hasLocale(routing.locales, first) ? first : routing.defaultLocale;
}

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
    const upstreamUrl = `${upstreamBase.replace(/\/+$/, "")}/api/v1/platform/${path.join("/")}${search}`;
    const locale = resolveLocale(request.headers.get("accept-language"));

    const headers: Record<string, string> = {
        accept: "application/json",
        "accept-language": locale,
        authorization: `Bearer ${session.token}`,
    };
    const contentType = request.headers.get("content-type");
    if (contentType) headers["content-type"] = contentType;

    const init: RequestInit & { duplex?: "half" } = { method, headers, cache: "no-store" };
    if (MUTATION_METHODS.has(method)) {
        const body = await request.arrayBuffer();
        if (body.byteLength > 0) {
            init.body = body;
            init.duplex = "half";
        }
    }

    const upstream = await fetch(upstreamUrl, init);
    const responseBody = await upstream.arrayBuffer();
    const response = new Response(responseBody, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });

    /** Clear the stale session on an upstream auth failure so the next render bounces to /login. */
    if (upstream.status === 401) {
        response.headers.append("set-cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
        response.headers.append("set-cookie", `${CSRF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
    }
    return response;
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
