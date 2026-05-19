import "server-only";

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

/** Server-side guard for the authenticated layout. `redirect` throws an internal Next.js
 *  exception, so the cast on the unreachable branch is only there to satisfy the type checker. */
export async function requireSession(locale: string): Promise<AdminSession> {
    const session = await getSession();
    if (session === null) {
        redirect({ href: "/login", locale });
        return null as unknown as AdminSession;
    }
    return session;
}
