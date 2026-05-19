import "server-only";

import { createApiClient } from "@calibra/sdk";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

/**
 * Server-only SDK factory pinned to the request's locale and (when present) the anonymous
 * `cart_token` cookie. Locale forwards as `Accept-Language` so the API resolves product names /
 * error messages in Persian or English to match the UI. The `cart_token` cookie rides along as
 * `Cookie: cart_token=…` so the API's cart resolver returns the same cart the browser owns.
 *
 * Wire bearer-token forwarding here once customer auth lands.
 */
export async function apiServer() {
    const locale = await getLocale();
    const store = await cookies();
    const cartToken = store.get("cart_token")?.value;
    return createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
        ...(cartToken ? { headers: { cookie: `cart_token=${cartToken}` } } : {}),
    });
}
