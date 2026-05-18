import "server-only";

import { createApiClient } from "@calibra/sdk";
import { getLocale } from "next-intl/server";

/**
 * Returns a SDK client configured for the current request locale (forwarded to the API via
 * `Accept-Language`). Server-side only — call from server components and route handlers.
 *
 * Add the bearer token here once auth lands: read it from cookies and pass `token`.
 */
export async function apiServer() {
    const locale = await getLocale();
    return createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
    });
}
