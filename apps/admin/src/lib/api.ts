import "server-only";

import { createApiClient } from "@calibra/sdk";
import { getLocale } from "next-intl/server";

import { getSession } from "./auth";

/**
 * Server-only SDK factory pinned to the request's locale (`Accept-Language`) and bearer token
 * (`Authorization: Bearer …`). The token is read from the `admin_session` cookie via
 * {@link getSession}; pages that don't yet have a session simply call the API anonymously and
 * receive a 401 / 403 from the admin endpoints (the layout's `requireSession()` guard catches
 * that earlier in the render path).
 */
export async function apiServer() {
    const [locale, session] = await Promise.all([getLocale(), getSession()]);
    return createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
        ...(session ? { token: session.token } : {}),
    });
}
