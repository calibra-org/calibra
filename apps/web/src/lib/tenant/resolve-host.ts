import { SHOPS_ROOT } from "./constants";

/**
 * Classification of a request `Host`:
 * - `subdomain` — a shop reached at `<slug>.<SHOPS_ROOT>` (e.g. `aurora.shops.calibra.app`).
 * - `custom` — a shop's own mapped domain (e.g. `acme.com`); the backend resolves it via
 *   `tenant_domains`.
 * - `platform` — the apex, an unknown/system host, or a dev/infra host that is not a shop.
 */
export type ResolvedHost = { kind: "subdomain"; slug: string } | { kind: "custom"; domain: string } | { kind: "platform" };

/** A subdomain label is a single DNS label of lowercase alphanumerics with internal dashes. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolve a request `Host` to a tenant reference (RULE A). Strips the port, lowercases, and matches
 * the configured `<slug>.<root>` shape. Bare `localhost`, the apex `root` itself, and the per-spin
 * infra hosts (`*.spin.localhost`) are platform — never a shop. Anything else with no `root` suffix
 * is treated as a custom domain for the backend to resolve.
 *
 * @param rawHost the raw `Host` header (may include a `:port` and mixed case)
 * @param root the shop root domain; defaults to {@link SHOPS_ROOT}
 */
export function resolveHost(rawHost: string | null | undefined, root: string = SHOPS_ROOT): ResolvedHost {
    if (!rawHost) return { kind: "platform" };
    const host = rawHost.trim().toLowerCase().split(":", 1)[0] ?? "";
    if (host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
        return { kind: "platform" };
    }
    /** The apex of the shop root, and the per-checkout spin infra hosts, are not shops. */
    if (host === root || host.endsWith(".spin.localhost")) {
        return { kind: "platform" };
    }
    const suffix = `.${root}`;
    if (host.endsWith(suffix)) {
        const slug = host.slice(0, -suffix.length);
        return SLUG_RE.test(slug) ? { kind: "subdomain", slug } : { kind: "platform" };
    }
    return { kind: "custom", domain: host };
}

/** The tenant reference the backend understands for a resolved host (slug or custom domain). */
export function tenantRefFor(resolved: ResolvedHost): string | null {
    if (resolved.kind === "subdomain") return resolved.slug;
    if (resolved.kind === "custom") return resolved.domain;
    return null;
}
