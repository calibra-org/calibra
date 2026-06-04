import "server-only";

import { BackendError, createApiClient } from "@calibra/sdk";
import { cookies } from "next/headers";

import { redirect } from "#/lib/i18n/navigation";
import { TENANT_HEADER } from "#/lib/tenant/constants";
import { tenantRefFromHeaders } from "#/lib/tenant/current-tenant";

/**
 * Session helpers for the admin panel. The session cookie carries a JSON-encoded
 * `{ token, userId, email, displayName, tenantSlug }` payload; `token` is the opaque bearer issued
 * by `POST /api/v1/auth/login` and is forwarded as `Authorization: Bearer …` by `apiServer()`.
 * `tenantSlug` is the host ref the login happened under (RULE A) — every request re-checks it
 * against the current `Host`.
 *
 * Server actions for login/logout live in `./auth-actions.ts` because Next.js requires the
 * `"use server"` directive at the top of a dedicated module.
 */

export const SESSION_COOKIE = "admin_session";

/**
 * Double-submit CSRF cookie. Readable by client JS (the React Query mutation helpers echo the
 * value into the `X-CSRF-Token` header); the route-handler proxy compares header against cookie
 * and rejects mutations that don't match.
 */
export const CSRF_COOKIE = "admin_csrf";

export interface AdminSession {
    userId: number;
    email: string;
    displayName: string;
    /** Opaque bearer token. Pass to `apiServer({ token })` for authenticated calls. */
    token: string;
    /**
     * The tenant ref (slug or custom domain) the login happened under, captured from the `Host`.
     * `requireSession` rejects the session if the current `Host` resolves to a different tenant —
     * a staff member can't carry an Aurora session onto Mehr's admin (RULE A).
     */
    tenantSlug: string;
}

export async function getSession(): Promise<AdminSession | null> {
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE);
    if (cookie === undefined || cookie.value.length === 0) return null;
    try {
        const parsed = JSON.parse(cookie.value) as AdminSession;
        if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
        return parsed;
    } catch {
        return null;
    }
}

/** A validated session plus the impersonation state surfaced by `/auth/me` (Phase 4 RULE D). */
export interface AuthenticatedSession {
    session: AdminSession;
    /**
     * The platform operator's id when this token is an impersonation token (a support operator
     * "logged in as" this shop), else `null`. Drives the persistent impersonation banner.
     */
    impersonatedBy: number | null;
}

/**
 * Server-side guard for the authenticated layout. Redirects to `/login` when the cookie is
 * absent, malformed, the `Host` resolves to a different tenant (RULE A), or the token has been
 * revoked / expired (cleared on DB reset, peer logout, etc.). The single `/auth/me` call both
 * validates the token and reports whether the session is an impersonation (RULE D), so the layout
 * can render the banner without a second round-trip.
 *
 * `redirect` throws an internal Next.js exception, so the casts on the unreachable branches are
 * only there to satisfy the type checker.
 */
export async function requireSession(locale: string): Promise<AuthenticatedSession> {
    const session = await getSession();
    if (session === null) {
        redirect({ href: "/login", locale });
        return null as unknown as AuthenticatedSession;
    }

    /**
     * RULE A — the session must match the tenant the `Host` resolves to. Session cookies are
     * host-scoped so this rarely triggers in a browser, but it closes the gap if a cookie is shared
     * across admin subdomains and makes the host/tenant boundary explicit (the API enforces it too
     * via `E_TENANT_MISMATCH`, surfaced as a 403 below).
     */
    const hostRef = await tenantRefFromHeaders();
    if (hostRef === null || session.tenantSlug !== hostRef) {
        redirect({ href: "/login", locale });
        return null as unknown as AuthenticatedSession;
    }

    try {
        const api = createApiClient({
            baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
            token: session.token,
            locale,
            headers: { [TENANT_HEADER]: hostRef },
        });
        const { data } = await api.storefront.GET("/api/v1/auth/me", {});
        const impersonatedBy = typeof data?.impersonated_by === "number" ? data.impersonated_by : null;
        return { session, impersonatedBy };
    } catch (err) {
        if (err instanceof BackendError && (err.status === 401 || err.status === 403)) {
            /**
             * Next.js 16 forbids `cookies().delete()` outside server actions / route handlers,
             * and {@link requireSession} runs during the authenticated layout render — a
             * server component context where mutation throws. The stale cookie is harmless:
             * {@link getSession} only checks for presence, and {@link loginAction} overwrites
             * both cookies on the next successful sign-in. Explicit sign-out still routes
             * through {@link logoutAction} which clears them in a valid context.
             */
            redirect({ href: "/login", locale });
            return null as unknown as AuthenticatedSession;
        }
        throw err;
    }
}
