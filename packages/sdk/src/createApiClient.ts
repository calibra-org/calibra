import { getBaseUrl } from "./getBaseUrl";
import { HttpClient, type HttpClientOptions } from "./HttpClient";
import type { WcCart, WcProduct } from "./types";

export interface CreateApiClientOptions extends Partial<Pick<HttpClientOptions, "headers" | "fetch">> {
    /** WordPress site origin, e.g. `"https://shop.example.com"`. Defaults to {@link getBaseUrl}. */
    baseUrl?: string;
    /**
     * Storefront cart token returned by the Store API as a `Cart-Token` response header. Forward it on
     * subsequent cart requests so WooCommerce keeps mutating the same cart for the same visitor.
     */
    cartToken?: string;
    /**
     * Optional WooCommerce REST API consumer key. Only required for admin endpoints (`/wp-json/wc/v3/*`).
     * The Storefront methods on the returned client use the public Store API and do not need this.
     */
    consumerKey?: string;
    consumerSecret?: string;
}

export interface ApiClient {
    /** Pre-configured HTTP client. Use this to hit non-storefront endpoints (`/wp-json/wc/v3/*`, custom routes). */
    http: HttpClient;
    products: {
        list: (params?: { page?: number; per_page?: number; search?: string; category?: string }) => Promise<WcProduct[]>;
        bySlug: (slug: string) => Promise<WcProduct | null>;
        byId: (id: number) => Promise<WcProduct>;
    };
    cart: {
        get: () => Promise<WcCart>;
        addItem: (input: { id: number; quantity: number }) => Promise<WcCart>;
        updateItem: (key: string, quantity: number) => Promise<WcCart>;
        removeItem: (key: string) => Promise<WcCart>;
    };
}

/**
 * Build a typed client around the WooCommerce Store API (`/wp-json/wc/store/v1/*`).
 *
 * The Store API is public and cart-token-scoped — designed for headless storefronts. Use the returned
 * `http` field for admin endpoints (`/wp-json/wc/v3/*`) that require consumer key/secret auth.
 */
export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
    const origin = (options.baseUrl ?? getBaseUrl()).replace(/\/+$/, "");

    const http = new HttpClient({
        baseUrl: `${origin}/wp-json/wc/store/v1`,
        headers: {
            accept: "application/json",
            "Cart-Token": options.cartToken,
            authorization: buildBasicAuth(options.consumerKey, options.consumerSecret),
            ...options.headers,
        },
        fetch: options.fetch,
    });

    return {
        http,
        products: {
            list: (params) => http.get<WcProduct[]>("/products", { query: params }),
            byId: (id) => http.get<WcProduct>(`/products/${id}`),
            bySlug: async (slug) => {
                const list = await http.get<WcProduct[]>("/products", { query: { slug } });
                return list[0] ?? null;
            },
        },
        cart: {
            get: () => http.get<WcCart>("/cart"),
            addItem: (input) => http.post<WcCart>("/cart/add-item", input),
            updateItem: (key, quantity) => http.post<WcCart>("/cart/update-item", { key, quantity }),
            removeItem: (key) => http.post<WcCart>("/cart/remove-item", { key }),
        },
    };
}

function buildBasicAuth(key: string | undefined, secret: string | undefined): string | undefined {
    if (key === undefined || secret === undefined) return undefined;
    const encoded = typeof btoa === "function" ? btoa(`${key}:${secret}`) : Buffer.from(`${key}:${secret}`).toString("base64");
    return `Basic ${encoded}`;
}
