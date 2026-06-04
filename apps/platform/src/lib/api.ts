import "server-only";

import { createApiClient } from "@calibra/sdk";
import { getLocale } from "next-intl/server";

import { getSession } from "./auth";

/**
 * Server-only SDK factory for the control plane, pinned to the request's locale (`Accept-Language`)
 * and the operator's `pat_` bearer (read from the `platform_session` cookie). No tenant header —
 * the control plane is global (RULE A). Use `(await apiServer()).platform` for the typed
 * control-plane client.
 */
export async function apiServer() {
    const [locale, session] = await Promise.all([getLocale(), getSession()]);
    return createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
        ...(session ? { token: session.token } : {}),
    });
}
