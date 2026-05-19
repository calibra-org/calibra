import { BackendError } from "./BackendError";
import { parseJsonBody, sanitizeHeaders } from "./internal/sanitize";

export interface HttpClientOptions {
    /** Base URL prepended to every request path. No trailing slash required — one will be added. */
    baseUrl: string;
    /** Default headers merged into every request. Falsy values are dropped (header sanitization). */
    headers?: Record<string, string | undefined | null>;
    /** Overridable fetch implementation. Defaults to global `fetch`. */
    fetch?: typeof fetch;
}

export interface RequestOptions {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    /** Query string parameters. `null` / `undefined` values are dropped. */
    query?: Record<string, string | number | boolean | null | undefined>;
    /** JSON body. Serialized with `JSON.stringify`. */
    body?: unknown;
    /** Per-request headers merged on top of the client defaults. */
    headers?: Record<string, string | undefined | null>;
    signal?: AbortSignal;
}

/**
 * Minimal framework-agnostic HTTP client. Designed so it can be used from server components,
 * route handlers, client components, and Node/edge runtimes without a runtime check.
 */
export class HttpClient {
    private readonly baseUrl: string;
    private readonly defaultHeaders: Record<string, string>;
    private readonly fetchImpl: typeof fetch;

    constructor(options: HttpClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.defaultHeaders = sanitizeHeaders(options.headers);
        this.fetchImpl = options.fetch ?? globalThis.fetch;
    }

    get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
        return this.request<T>(path, { ...options, method: "GET" });
    }

    post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
        return this.request<T>(path, { ...options, method: "POST", body });
    }

    put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
        return this.request<T>(path, { ...options, method: "PUT", body });
    }

    patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
        return this.request<T>(path, { ...options, method: "PATCH", body });
    }

    delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
        return this.request<T>(path, { ...options, method: "DELETE" });
    }

    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const url = this.buildUrl(path, options.query);
        const headers: Record<string, string> = {
            ...this.defaultHeaders,
            ...sanitizeHeaders(options.headers),
        };

        const hasBody = options.body !== undefined && options.body !== null;
        if (hasBody && headers["content-type"] === undefined && headers["Content-Type"] === undefined) {
            headers["content-type"] = "application/json";
        }

        let response: Response;
        try {
            response = await this.fetchImpl(url, {
                method: options.method ?? "GET",
                headers,
                body: hasBody ? JSON.stringify(options.body) : undefined,
                signal: options.signal,
            });
        } catch (cause) {
            throw new BackendError(0, null, cause instanceof Error ? cause.message : "Network error");
        }

        const text = await response.text();
        const body = parseJsonBody(text);

        if (!response.ok) {
            throw new BackendError(response.status, body, response.statusText);
        }

        return body as T;
    }

    private buildUrl(path: string, query?: RequestOptions["query"]): string {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        const qs = buildQueryString(query);
        return `${this.baseUrl}${normalizedPath}${qs}`;
    }
}

function buildQueryString(query: RequestOptions["query"]): string {
    if (query === undefined) return "";
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined) continue;
        params.append(key, String(value));
    }
    const serialized = params.toString();
    return serialized.length > 0 ? `?${serialized}` : "";
}
