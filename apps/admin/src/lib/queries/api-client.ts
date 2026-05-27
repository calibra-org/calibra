"use client";

/**
 * Browser fetch helpers for the same-origin admin proxy. Every call goes through `/api/admin/...`
 * so the bearer token stays on the server and CORS never enters the picture. Mutations include the
 * double-submit `X-CSRF-Token` header.
 */

class ProxyError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body?: unknown,
    ) {
        super(message);
        this.name = "ProxyError";
    }
}

/**
 * Reads the double-submit CSRF token from `document.cookie`. The cookie is set on login (server
 * action, name `admin_csrf`) and survives until logout / session expiry. Returns `undefined` only
 * in SSR contexts where `document` is not defined — every mutation hook must run in the browser.
 */
function getCsrfToken(): string | undefined {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined | null>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
        if (v === undefined || v === null) continue;
        search.set(k, String(v));
    }
    const qs = search.toString();
    const cleaned = path.replace(/^\/+/, "");
    return qs.length > 0 ? `/api/admin/${cleaned}?${qs}` : `/api/admin/${cleaned}`;
}

export interface ApiFetchOptions {
    locale: string;
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
}

/** GET against the admin proxy. Throws {@link ProxyError} on non-2xx responses. */
export async function apiGet<T>(path: string, options: ApiFetchOptions): Promise<T> {
    const res = await fetch(buildUrl(path, options.query), {
        method: "GET",
        headers: { "accept-language": options.locale, accept: "application/json" },
        signal: options.signal,
    });
    return readResponse<T>(res);
}

export interface ApiMutationOptions extends ApiFetchOptions {
    body?: unknown;
    /** Optional `If-Match` header value — forwarded to the api for optimistic concurrency checks. */
    ifMatch?: string;
}

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Sends a mutation through the proxy. Stamps `X-CSRF-Token` from `document.cookie` and
 * serializes a JSON body when provided; passes `null`/`undefined` bodies through as empty.
 */
export async function apiMutate<T>(method: MutationMethod, path: string, options: ApiMutationOptions): Promise<T> {
    const csrf = getCsrfToken();
    if (csrf === undefined) {
        throw new ProxyError("missing csrf token cookie", 403);
    }
    const headers: Record<string, string> = {
        "accept-language": options.locale,
        accept: "application/json",
        "x-csrf-token": csrf,
    };
    if (typeof options.ifMatch === "string" && options.ifMatch.length > 0) {
        headers["if-match"] = options.ifMatch;
    }
    let body: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(options.body);
    }
    const res = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        body,
        signal: options.signal,
    });
    return readResponse<T>(res);
}

async function readResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let parsed: unknown;
        try {
            parsed = await res.json();
        } catch {
            parsed = await res.text();
        }
        throw new ProxyError(`admin proxy returned ${res.status}`, res.status, parsed);
    }
    /** 204 responses (e.g. successful DELETE) ship no body — return undefined for callers that expect a value. */
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

export { ProxyError };
