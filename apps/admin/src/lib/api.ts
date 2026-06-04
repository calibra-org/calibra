import "server-only";

import { createApiClient } from "@calibra/sdk";
import { getLocale } from "next-intl/server";

import { getSession } from "./auth";
import { TENANT_HEADER } from "./tenant/constants";
import { tenantRefFromHeaders } from "./tenant/current-tenant";

/**
 * Server-only SDK factory pinned to the request's locale (`Accept-Language`), tenant
 * (`X-Calibra-Tenant`, resolved from the `Host` — RULE B), and bearer token (`Authorization:
 * Bearer …`). The token is read from the `admin_session` cookie via {@link getSession}; pages that
 * don't yet have a session simply call the API anonymously and receive a 401 / 403 from the admin
 * endpoints (the layout's `requireSession()` guard catches that earlier in the render path). The
 * tenant header is load-bearing on a custom admin domain the API also serves — without it the API
 * would fall back to `Host`, which is the admin host, not the storefront domain.
 */
export async function apiServer() {
    const [locale, session, tenant] = await Promise.all([getLocale(), getSession(), tenantRefFromHeaders()]);
    return createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
        ...(session ? { token: session.token } : {}),
        ...(tenant ? { headers: { [TENANT_HEADER]: tenant } } : {}),
    });
}
