import "server-only";

import { cookies } from "next/headers";

import { redirect } from "#/lib/i18n/navigation";

/**
 * Mock session helpers backed by the `admin_session` cookie. The cookie's presence is the entire
 * session in mock mode. When phase 03 (`@adonisjs/auth`) lands, swap `getSession()` to treat the
 * cookie value as the opaque `access_tokens` bearer and call `GET /api/v1/account/me`; the public
 * surface stays the same so pages don't change.
 *
 * Server actions for login/logout live in `./auth-actions.ts` because Next.js requires the
 * `"use server"` directive at the top of a dedicated module.
 */

export const SESSION_COOKIE = "admin_session";

export interface AdminSession {
    userId: number;
    email: string;
    displayName: string;
}

const MOCK_USER: AdminSession = {
    userId: 1,
    email: "admin@calibra.example",
    displayName: "Calibra Admin",
};

export async function getSession(): Promise<AdminSession | null> {
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE);
    if (cookie === undefined || cookie.value.length === 0) return null;
    return MOCK_USER;
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
