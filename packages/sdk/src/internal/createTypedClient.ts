import createOpenApiClient, { type Client, type QuerySerializerOptions } from "openapi-fetch";

import { backendErrorMiddleware } from "./middleware";
import { sanitizeHeaders } from "./sanitize";

export interface TypedClientOptions {
    /** API origin without trailing `/api/v1` — the OpenAPI paths already include it. */
    origin: string;
    /** Active locale forwarded as `Accept-Language` to the API. */
    locale?: string;
    /** Bearer token forwarded as `Authorization: Bearer …`. */
    token?: string;
    /** Extra headers merged in last; falsy values are dropped. */
    headers?: Record<string, string | undefined | null>;
    /** Overridable fetch implementation. Defaults to global `fetch`. */
    fetch?: typeof fetch;
}

/**
 * Default openapi-fetch query serialization. Matches the storefront/admin APIs (form-style scalars,
 * no array bracket notation) and silently drops `null` / `undefined` so callers can pass
 * `{ page: 1, search: undefined }` without polluting the URL.
 */
const querySerializer: QuerySerializerOptions = {
    array: { style: "form", explode: true },
    object: { style: "deepObject", explode: true },
};

/**
 * Construct an openapi-fetch client typed against the supplied `Paths` map. The function is
 * generic so it can back both the storefront and admin surfaces from a single implementation;
 * each call site re-exports it with the spec-specific path types pinned.
 */
export function createTypedClient<Paths extends {}>(options: TypedClientOptions): Client<Paths> {
    const headers = sanitizeHeaders({
        accept: "application/json",
        "accept-language": options.locale,
        authorization: options.token !== undefined ? `Bearer ${options.token}` : undefined,
        ...options.headers,
    });

    const client = createOpenApiClient<Paths>({
        baseUrl: options.origin.replace(/\/+$/, ""),
        headers,
        fetch: options.fetch,
        querySerializer,
    });
    client.use(backendErrorMiddleware);
    return client;
}
