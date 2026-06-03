import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { resolveHost, type ResolvedHost } from "./resolve-host";

/**
 * The tenant resolved from the request `Host` (RULE A). Resolving directly from the `Host` header
 * — rather than a middleware-forwarded header — means every server context agrees on one source of
 * truth: server components (matched by the proxy/middleware), server actions, *and* the same-origin
 * API proxy route (which the middleware matcher excludes). Request-cached so the whole tree shares
 * one parse.
 */
export const resolvedHost = cache(async (): Promise<ResolvedHost> => {
    const store = await headers();
    return resolveHost(store.get("host"));
});

/** The tenant ref (slug or custom domain) for this request, or `null` on a platform/unknown host. */
export async function tenantRefFromHeaders(): Promise<string | null> {
    const resolved = await resolvedHost();
    if (resolved.kind === "subdomain") return resolved.slug;
    if (resolved.kind === "custom") return resolved.domain;
    return null;
}
