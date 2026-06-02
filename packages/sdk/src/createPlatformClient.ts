import type { Client } from "openapi-fetch";

import { createTypedClient, type TypedClientOptions } from "./internal/createTypedClient";
import type { paths } from "./generated/platform";

/** Typed control-plane (platform) API client. Every operation is inferred from `platform.v1.yaml`. */
export type PlatformClient = Client<paths>;

/**
 * Build a typed openapi-fetch client for the Calibra control-plane (platform) API.
 *
 * Headers are sanitized (falsy values dropped), non-2xx responses throw {@link BackendError}, and
 * the Accept-Language / Authorization plumbing is wired from `options.locale` / `options.token`.
 * The token here is a `pat_`-prefixed platform token, not a tenant-side bearer token.
 */
export function createPlatformClient(options: TypedClientOptions): PlatformClient {
    return createTypedClient<paths>(options);
}
