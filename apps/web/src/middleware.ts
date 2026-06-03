import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "#/lib/i18n/routing";
import { TEMPLATE_KEY, TENANT_DATA_HEADER, TENANT_HEADER } from "#/lib/tenant/constants";
import type { StorefrontTenant } from "#/lib/tenant/current-tenant";
import { resolveHost, tenantRefFor } from "#/lib/tenant/resolve-host";

const handleI18n = createMiddleware(routing);

type Outcome = { status: "ok"; tenant: StorefrontTenant } | { status: "not-found" } | { status: "unavailable" };

/**
 * Validate a tenant reference against the API's public tenant endpoint. The backend answers 404 for
 * an unknown ref and 503 for a suspended/archived shop (see `tenant_context_middleware`), so the
 * status maps directly to a routing outcome. A transport error is treated as not-found (fail closed:
 * never render an unscoped shop). The endpoint is cached server-side, so this stays cheap per request.
 */
async function fetchTenant(ref: string): Promise<Outcome> {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
    if (!base) return { status: "not-found" };
    try {
        const res = await fetch(`${base}/api/v1/storefront/tenant`, {
            headers: { [TENANT_HEADER]: ref, accept: "application/json" },
            cache: "no-store",
        });
        if (res.status === 503) return { status: "unavailable" };
        if (!res.ok) return { status: "not-found" };
        const body = (await res.json()) as { data: StorefrontTenant };
        return { status: "ok", tenant: body.data };
    } catch {
        return { status: "not-found" };
    }
}

/** Internal rewrite to a platform state page (`not-found` / `unavailable` / `misrouted`). */
function platformRewrite(request: NextRequest, segment: string): NextResponse {
    return NextResponse.rewrite(new URL(`/platform/${segment}`, request.url));
}

/**
 * Storefront request pipeline. Tenant resolution (RULE A) runs in front of next-intl: the `Host`
 * resolves to a tenant ref, the ref is validated against the API, and any non-OK outcome rewrites to
 * a `/platform/*` page so no shop route ever renders without a resolved, active, correctly-templated
 * tenant. On success the validated profile is handed to the render path via request headers
 * (`x-calibra-tenant` for downstream API scoping, `x-calibra-tenant-data` for branding) and the
 * request is delegated to next-intl for locale routing (RULE D — tenant and locale are independent).
 */
export default async function middleware(request: NextRequest) {
    const resolved = resolveHost(request.headers.get("host"));
    const ref = tenantRefFor(resolved);

    if (ref === null) {
        return platformRewrite(request, "not-found");
    }

    const outcome = await fetchTenant(ref);
    if (outcome.status === "unavailable") return platformRewrite(request, "unavailable");
    if (outcome.status !== "ok") return platformRewrite(request, "not-found");
    if (outcome.tenant.template_key !== TEMPLATE_KEY) {
        return platformRewrite(request, `misrouted?got=${encodeURIComponent(outcome.tenant.template_key)}`);
    }

    const intl = handleI18n(request);
    /** A locale redirect (e.g. stripping the default-locale prefix) re-enters middleware — pass it. */
    if (intl.headers.has("location")) return intl;

    const encoded = encodeURIComponent(JSON.stringify(outcome.tenant));

    /**
     * next-intl forwards the full request-header set to RSC via Next's `x-middleware-*` protocol.
     * Append our two headers to that set so the tenant survives intact alongside next-intl's locale
     * routing. If next-intl produced no override set, replicate its decision ourselves.
     */
    const overrides = intl.headers.get("x-middleware-override-headers");
    if (overrides !== null) {
        intl.headers.set("x-middleware-override-headers", `${overrides},${TENANT_HEADER},${TENANT_DATA_HEADER}`);
        intl.headers.set(`x-middleware-request-${TENANT_HEADER}`, ref);
        intl.headers.set(`x-middleware-request-${TENANT_DATA_HEADER}`, encoded);
        return intl;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(TENANT_HEADER, ref);
    requestHeaders.set(TENANT_DATA_HEADER, encoded);
    const rewrite = intl.headers.get("x-middleware-rewrite");
    const response = rewrite
        ? NextResponse.rewrite(new URL(rewrite, request.url), { request: { headers: requestHeaders } })
        : NextResponse.next({ request: { headers: requestHeaders } });
    for (const cookie of intl.cookies.getAll()) response.cookies.set(cookie);
    return response;
}

export const config = {
    /**
     * Match every request except Next.js internals, static assets, the API surface, and files with
     * an extension (favicon, sitemap, robots). The tenant + locale pipeline only needs route requests.
     */
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
