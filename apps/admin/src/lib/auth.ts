import "server-only";

import { BackendError, createApiClient } from "@calibra/sdk";
import { cookies } from "next/headers";

import { redirect } from "#/lib/i18n/navigation";

/**
 * Session helpers for the admin panel. The session cookie carries a JSON-encoded
 * `{ token, userId, email, displayName }` payload; `token` is the opaque bearer issued by
 * `POST /api/v1/auth/login` and is forwarded as `Authorization: Bearer …` by `apiServer()`.
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

/**
 * Server-side guard for the authenticated layout. Redirects to `/login` when the cookie is
 * absent, malformed, or carries a token the API has revoked / expired / never knew about
 * (cleared on DB reset, manual logout from another tab, etc.). A single `/auth/me` call
 * validates the token without surfacing 401s into page renders downstream.
 *
 * `redirect` throws an internal Next.js exception, so the cast on the unreachable branch is
 * only there to satisfy the type checker.
 */
export async function requireSession(locale: string): Promise<AdminSession> {
    const session = await getSession();
    if (session === null) {
        redirect({ href: "/login", locale });
        return null as unknown as AdminSession;
    }
    try {
        const api = createApiClient({
            baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
            token: session.token,
        });
        await api.storefront.GET("/api/v1/auth/me", {});
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
            return null as unknown as AdminSession;
        }
        throw err;
    }
    return session;
}
