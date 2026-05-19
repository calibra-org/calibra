import type { Client } from "openapi-fetch";

import { createTypedClient, type TypedClientOptions } from "./internal/createTypedClient";
import type { paths } from "./generated/storefront";

/** Typed storefront API client. Every operation is inferred from `storefront.v1.yaml`. */
export type StorefrontClient = Client<paths>;

/**
 * Build a typed openapi-fetch client for the Calibra storefront API.
 *
 * Headers are sanitized (falsy values dropped), non-2xx responses throw {@link BackendError}, and
 * the Accept-Language / Authorization plumbing is wired from `options.locale` / `options.token`.
 */
export function createStorefrontClient(options: TypedClientOptions): StorefrontClient {
    return createTypedClient<paths>(options);
}
