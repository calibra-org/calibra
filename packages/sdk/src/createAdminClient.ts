import type { Client } from "openapi-fetch";

import type { paths } from "./generated/admin";
import { createTypedClient, type TypedClientOptions } from "./internal/createTypedClient";

/** Typed admin API client. Every operation is inferred from `admin.v1.yaml`. */
export type AdminClient = Client<paths>;

/**
 * Build a typed openapi-fetch client for the Calibra admin API.
 *
 * Headers are sanitized (falsy values dropped), non-2xx responses throw {@link BackendError}, and
 * the Accept-Language / Authorization plumbing is wired from `options.locale` / `options.token`.
 */
export function createAdminClient(options: TypedClientOptions): AdminClient {
    return createTypedClient<paths>(options);
}
