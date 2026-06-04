import { randomUUID } from "node:crypto";
import { BackendError, createApiClient } from "@calibra/sdk";
import { type NextRequest, NextResponse } from "next/server";

import { CSRF_COOKIE, SESSION_COOKIE } from "#/lib/auth";
import { TENANT_HEADER } from "#/lib/tenant/constants";
import { tenantRefFromHeaders } from "#/lib/tenant/current-tenant";

/** Impersonation tokens are short-lived (the platform mints them for 30 min); match the cookie TTL. */
const IMPERSONATION_TTL_SECONDS = 60 * 30;

/**
 * Impersonation hand-off (Phase 5, RULE D). The control plane mints a short-lived shop-admin token
 * and opens `<slug>.admin.<host>/api/impersonate?token=…` in a new tab. This route exchanges that
 * token for an `admin_session`: it validates the token against the tenant the `Host` resolves to
 * (so an Aurora token can't seed a Mehr session — RULE A) via `/auth/me`, writes the session +
 * CSRF cookies (httpOnly bearer), and redirects to the dashboard. `/auth/me` reports
 * `impersonated_by`, so the authenticated layout then renders the persistent "impersonating" banner
 * + exit control. On any failure (no/expired token, non-admin, tenant mismatch) it bounces to login.
 *
 * Excluded from the per-tenant proxy by the `/api` matcher carve-out, so it runs as a normal route
 * handler — the only place we can set httpOnly cookies *and* redirect in one response.
 */
export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token");
    const dashboard = new URL("/dashboard", request.nextUrl.origin);
    const login = new URL("/login", request.nextUrl.origin);

    if (!token) return NextResponse.redirect(login);

    const tenant = await tenantRefFromHeaders();
    if (tenant === null) return NextResponse.redirect(login);

    try {
        const api = createApiClient({
            baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
            token,
            headers: { [TENANT_HEADER]: tenant },
        });
        const { data } = await api.storefront.GET("/api/v1/auth/me", {});
        if (!data || data.user.role !== "admin") return NextResponse.redirect(login);

        const customer = data.customer;
        const displayName =
            customer && (customer.first_name || customer.last_name)
                ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
                : (data.user.email ?? `#${data.user.id}`);

        const session = {
            token,
            userId: Number(data.user.id),
            email: data.user.email ?? "",
            displayName,
            tenantSlug: tenant,
        };

        const response = NextResponse.redirect(dashboard);
        const secure = process.env.NODE_ENV === "production";
        response.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure,
            maxAge: IMPERSONATION_TTL_SECONDS,
        });
        /** Companion CSRF token, readable by client JS so mutation helpers can echo it back. */
        response.cookies.set(CSRF_COOKIE, randomUUID(), {
            httpOnly: false,
            sameSite: "lax",
            path: "/",
            secure,
            maxAge: IMPERSONATION_TTL_SECONDS,
        });
        return response;
    } catch (err) {
        if (err instanceof BackendError) return NextResponse.redirect(login);
        throw err;
    }
}
