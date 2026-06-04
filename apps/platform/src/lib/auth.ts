import "server-only";

import { cookies } from "next/headers";

import { redirect } from "#/lib/i18n/navigation";

/**
 * Session helpers for the control plane. The session cookie carries a JSON-encoded
 * `{ token, userId, email, name, role }` payload; `token` is the opaque `pat_` bearer issued by
 * `POST /api/v1/platform/auth/login` and forwarded as `Authorization: Bearer …` by `apiServer()` /
 * the same-origin proxy. The control plane is global (NOT per-tenant) — there is no tenant scoping
 * here, unlike the admin panel.
 *
 * Server actions for login/logout live in `./auth-actions.ts` (Next requires the `"use server"`
 * directive at the top of a dedicated module).
 */

export const SESSION_COOKIE = "platform_session";

/**
 * Double-submit CSRF cookie. Readable by client JS (the React Query mutation helpers echo the value
 * into the `X-CSRF-Token` header); the route-handler proxy compares header against cookie and
 * rejects mutations that don't match.
 */
export const CSRF_COOKIE = "platform_csrf";

export interface PlatformSession {
    userId: number;
    email: string;
    name: string;
    role: string;
    /** Opaque `pat_` bearer token. */
    token: string;
}

export async function getSession(): Promise<PlatformSession | null> {
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE);
    if (cookie === undefined || cookie.value.length === 0) return null;
    try {
        const parsed = JSON.parse(cookie.value) as PlatformSession;
        if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Server-side guard for the authenticated layout. Redirects to `/login` when the session cookie is
 * absent or malformed. Token validity itself is enforced per call by the API: the same-origin proxy
 * clears the cookie on an upstream 401, so a revoked/expired token bounces the next render to login.
 * `redirect` throws an internal Next.js exception, so the cast on the unreachable branch only
 * satisfies the type checker.
 */
export async function requireSession(locale: string): Promise<PlatformSession> {
    const session = await getSession();
    if (session === null) {
        redirect({ href: "/login", locale });
        return null as unknown as PlatformSession;
    }
    return session;
}
