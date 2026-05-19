import { type AdminClient, createAdminClient } from "./createAdminClient";
import { createStorefrontClient, type StorefrontClient } from "./createStorefrontClient";
import { getBaseUrl } from "./getBaseUrl";
import { HttpClient, type HttpClientOptions } from "./HttpClient";

export interface CreateApiClientOptions extends Partial<Pick<HttpClientOptions, "headers" | "fetch">> {
    /** API origin, e.g. `"https://api.example.com"`. Defaults to {@link getBaseUrl}. */
    baseUrl?: string;
    /** Bearer token issued by `POST /api/v1/auth/login`. Forwarded as `Authorization: Bearer …`. */
    token?: string;
    /**
     * Active UI locale (`"en"` / `"fa"`). Forwarded as `Accept-Language` so the API can localize
     * validator messages, error responses, and any translatable content. Pass it from the calling
     * app's i18n hook (`useLocale()` in next-intl) so the two never drift out of sync.
     */
    locale?: string;
}

export interface ApiClient {
    /** Low-level fetch wrapper mounted at `${baseUrl}/api/v1`. Use for endpoints not yet in the spec. */
    http: HttpClient;
    /** Typed storefront client — inferred from `storefront.v1.yaml`. */
    storefront: StorefrontClient;
    /** Typed admin client — inferred from `admin.v1.yaml`. */
    admin: AdminClient;
}

/**
 * Build the bundled Calibra API client. Returns three clients sharing the same baseUrl, locale,
 * and bearer token:
 *
 * - `storefront` and `admin` are typed openapi-fetch clients; their operation signatures, body
 *   shapes, and response envelopes are inferred from the OpenAPI specs.
 * - `http` is the low-level {@link HttpClient} kept as an escape hatch for endpoints that aren't
 *   in the spec yet.
 *
 * Works from React server components, route handlers, the browser, and Node/edge runtimes — the
 * underlying transports only assume global `fetch`.
 */
export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
    const origin = (options.baseUrl ?? getBaseUrl()).replace(/\/+$/, "");

    const http = new HttpClient({
        baseUrl: `${origin}/api/v1`,
        headers: {
            accept: "application/json",
            "accept-language": options.locale,
            authorization: options.token !== undefined ? `Bearer ${options.token}` : undefined,
            ...options.headers,
        },
        fetch: options.fetch,
    });

    const typedOptions = {
        origin,
        locale: options.locale,
        token: options.token,
        headers: options.headers,
        fetch: options.fetch,
    };

    return {
        http,
        storefront: createStorefrontClient(typedOptions),
        admin: createAdminClient(typedOptions),
    };
}
