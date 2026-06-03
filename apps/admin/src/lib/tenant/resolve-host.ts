import { ADMIN_ROOT } from "./constants";

/**
 * Classification of a request `Host` reaching the admin panel:
 * - `subdomain` — a shop's admin at `<slug>.<ADMIN_ROOT>` (e.g. `aurora.admin.calibra.app`).
 * - `custom` — a shop's mapped admin domain `admin.<domain>` (e.g. `admin.acme.com`); the ref is the
 *   storefront `domain` the API resolves via `tenant_domains`.
 * - `platform` — the apex/root itself, bare `localhost`, the per-spin infra hosts (`*.spin.localhost`),
 *   or anything that names no shop. These render the "unknown shop" page — the admin is per-tenant.
 */
export type ResolvedHost = { kind: "subdomain"; slug: string } | { kind: "custom"; domain: string } | { kind: "platform" };

/** A subdomain label is a single DNS label of lowercase alphanumerics with internal dashes. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolve a request `Host` to a tenant reference (RULE A). Strips the port, lowercases, and matches
 * the configured admin shapes. Bare `localhost`, the apex `root`, and the per-spin infra hosts
 * (`*.spin.localhost`) are platform — never a shop. A host of the form `admin.<domain>` is a custom
 * admin domain whose ref is `<domain>` (the storefront domain the API knows).
 *
 * @param rawHost the raw `Host` header (may include a `:port` and mixed case)
 * @param root the admin root domain; defaults to {@link ADMIN_ROOT}
 */
export function resolveHost(rawHost: string | null | undefined, root: string = ADMIN_ROOT): ResolvedHost {
    if (!rawHost) return { kind: "platform" };
    const host = rawHost.trim().toLowerCase().split(":", 1)[0] ?? "";
    if (host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
        return { kind: "platform" };
    }
    /** The apex of the admin root, and the per-checkout spin infra hosts, are not shops. */
    if (host === root || host.endsWith(".spin.localhost")) {
        return { kind: "platform" };
    }
    const suffix = `.${root}`;
    if (host.endsWith(suffix)) {
        const slug = host.slice(0, -suffix.length);
        return SLUG_RE.test(slug) ? { kind: "subdomain", slug } : { kind: "platform" };
    }
    if (host.startsWith("admin.")) {
        const domain = host.slice("admin.".length);
        return domain.length > 0 ? { kind: "custom", domain } : { kind: "platform" };
    }
    return { kind: "platform" };
}

/** The tenant reference the backend understands for a resolved host (slug or custom domain), or null. */
export function tenantRefFor(resolved: ResolvedHost): string | null {
    if (resolved.kind === "subdomain") return resolved.slug;
    if (resolved.kind === "custom") return resolved.domain;
    return null;
}

/** A human-facing shop label for the resolved host — the slug or the custom domain. */
export function tenantLabelFor(resolved: ResolvedHost): string | null {
    return tenantRefFor(resolved);
}
