import type { Middleware } from "openapi-fetch";

import { BackendError } from "../BackendError";

import { parseJsonBody } from "./sanitize";

/**
 * Middleware that wraps non-2xx responses in {@link BackendError}, mirroring the throw-on-failure
 * contract of {@link HttpClient}. Returning a non-Response from `onResponse` is the documented way
 * to short-circuit the openapi-fetch result; here we throw instead so callers get a Promise
 * rejection rather than a `{ error }` discriminant — keeping the SDK's behavior consistent across
 * the low-level and high-level clients.
 */
export const backendErrorMiddleware: Middleware = {
    async onResponse({ response }) {
        if (response.ok) return undefined;
        const text = await response.clone().text();
        throw new BackendError(response.status, parseJsonBody(text), response.statusText);
    },
};
