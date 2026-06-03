import "server-only";

import type { StorefrontSchemas } from "@calibra/sdk";
import { headers } from "next/headers";
import { cache } from "react";

import { TENANT_DATA_HEADER } from "./constants";

/** The public tenant profile + branding, exactly as the storefront-tenant endpoint returns it. */
export type StorefrontTenant = StorefrontSchemas["schemas"]["StorefrontTenant"];

/**
 * The active tenant for this request (RULE A). The middleware already resolved the `Host`, validated
 * the tenant against the API, and serialized its profile + branding into {@link TENANT_DATA_HEADER}
 * (percent-encoded so Persian copy survives the latin1 header channel). Reading it here means the
 * render path needs no second round-trip. Non-OK hosts (platform / unknown / suspended / misrouted)
 * never reach a `[locale]` server component — the middleware rewrites them to `/platform/*` — so a
 * missing/invalid header is treated as a hard bug and surfaced as `null`.
 *
 * Wrapped in React `cache()` so every server component in the tree shares one parsed object.
 */
export const currentTenant = cache(async (): Promise<StorefrontTenant | null> => {
    const store = await headers();
    const encoded = store.get(TENANT_DATA_HEADER);
    if (!encoded) return null;
    try {
        return JSON.parse(decodeURIComponent(encoded)) as StorefrontTenant;
    } catch {
        return null;
    }
});

/**
 * Like {@link currentTenant} but throws when the tenant is absent — use in the render path where a
 * resolved tenant is an invariant (a page rendering without one is a bug, see RULE A).
 */
export async function requireTenant(): Promise<StorefrontTenant> {
    const tenant = await currentTenant();
    if (!tenant) {
        throw new Error("requireTenant(): no tenant on the request — middleware did not resolve a shop.");
    }
    return tenant;
}
