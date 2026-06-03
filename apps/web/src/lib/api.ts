import "server-only";

import { createApiClient } from "@calibra/sdk";
import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { TENANT_HEADER } from "#/lib/tenant/constants";

/**
 * Server-only SDK factory pinned to the request's locale, tenant, and (when present) the anonymous
 * `cart_token` cookie. Locale forwards as `Accept-Language` so the API resolves product names /
 * error messages in Persian or English to match the UI. The tenant resolved by the middleware from
 * the request `Host` forwards as `X-Calibra-Tenant` so every storefront data call is scoped to the
 * right shop (RULE A — this is the load-bearing wire; without it the API can't scope the request).
 * The `cart_token` cookie rides along as `Cookie: cart_token=…` so the API's cart resolver returns
 * the same cart the browser owns.
 *
 * Wire bearer-token forwarding here once customer auth lands.
 */
export async function apiServer() {
    const [locale, store, requestHeaders] = await Promise.all([getLocale(), cookies(), headers()]);
    const cartToken = store.get("cart_token")?.value;
    const tenant = requestHeaders.get(TENANT_HEADER);

    const forwarded: Record<string, string> = {};
    if (tenant) forwarded[TENANT_HEADER] = tenant;
    if (cartToken) forwarded.cookie = `cart_token=${cartToken}`;

    return createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
        ...(Object.keys(forwarded).length > 0 ? { headers: forwarded } : {}),
    });
}
