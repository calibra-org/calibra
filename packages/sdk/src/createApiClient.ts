import { getBaseUrl } from "./getBaseUrl";
import { HttpClient, type HttpClientOptions } from "./HttpClient";
import type { Cart, Paginated, Product, Resource } from "./types";

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
    /** Pre-configured low-level client. Use directly for endpoints not yet wrapped below. */
    http: HttpClient;

    products: {
        list: (params?: { page?: number; per_page?: number; search?: string }) => Promise<Paginated<Product>>;
        bySlug: (slug: string) => Promise<Product>;
    };

    cart: {
        get: (cartId: string) => Promise<Cart>;
        addLine: (cartId: string, input: { productId: number; quantity: number }) => Promise<Cart>;
        updateLine: (cartId: string, lineKey: string, quantity: number) => Promise<Cart>;
        removeLine: (cartId: string, lineKey: string) => Promise<Cart>;
    };
}

/**
 * Build a typed client around the Calibra commerce API (`/api/v1/*`).
 *
 * Same client works from React server components, route handlers, the browser, and Node/edge
 * runtimes — the underlying {@link HttpClient} only assumes global `fetch`.
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

    return {
        http,
        products: {
            list: (params) => http.get<Paginated<Product>>("/products", { query: params }),
            bySlug: async (slug) => {
                const { data } = await http.get<Resource<Product>>(`/products/${encodeURIComponent(slug)}`);
                return data;
            },
        },
        cart: {
            get: async (cartId) => {
                const { data } = await http.get<Resource<Cart>>(`/carts/${encodeURIComponent(cartId)}`);
                return data;
            },
            addLine: async (cartId, input) => {
                const { data } = await http.post<Resource<Cart>>(`/carts/${encodeURIComponent(cartId)}/lines`, input);
                return data;
            },
            updateLine: async (cartId, lineKey, quantity) => {
                const { data } = await http.patch<Resource<Cart>>(
                    `/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineKey)}`,
                    { quantity },
                );
                return data;
            },
            removeLine: async (cartId, lineKey) => {
                const { data } = await http.delete<Resource<Cart>>(
                    `/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineKey)}`,
                );
                return data;
            },
        },
    };
}
