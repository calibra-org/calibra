import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "#/lib/i18n/routing";
import { resolveHost, tenantRefFor } from "#/lib/tenant/resolve-host";

const handleI18n = createMiddleware(routing);

/**
 * Admin request pipeline. Tenant resolution (RULE A) runs in front of next-intl: the admin is
 * per-tenant, so a `Host` that names no shop — the apex/root, bare `localhost`, or the per-spin
 * infra hosts (`*.spin.localhost`) — renders the platform "unknown shop" page instead of any shop's
 * login or data. A shop host (`<slug>.admin.<root>` or `admin.<domain>`) is delegated to next-intl
 * for locale routing.
 *
 * The tenant ref itself is not forwarded as a request header here: every server context
 * (`apiServer()`, the `/api/admin` proxy, login + session checks) resolves it from the `Host` header
 * directly (`lib/tenant/current-tenant.ts`), so there is one source of truth and no dependence on
 * the middleware-override-header dance — which the `/api` matcher exclusion would break anyway.
 */
export default function middleware(request: NextRequest) {
    const ref = tenantRefFor(resolveHost(request.headers.get("host")));
    if (ref === null) {
        return NextResponse.rewrite(new URL(`/${routing.defaultLocale}/unknown-shop`, request.url));
    }
    return handleI18n(request);
}

export const config = {
    matcher: ["/((?!api|__transmit|_next|_vercel|.*\\..*).*)"],
};
