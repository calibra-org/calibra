/**
 * Request header carrying the host-resolved tenant ref (slug or custom domain). The same-origin
 * proxy and `apiServer()` forward it on every upstream call so the API scopes the request to the
 * shop (Phase 4 RULE B). The API double-checks the bearer's user belongs to that tenant on top of
 * RLS. HTTP header names are case-insensitive; the API accepts it as `X-Calibra-Tenant`.
 */
export const TENANT_HEADER = "x-calibra-tenant";

/**
 * Root domain under which shop admin subdomains live: a shop's admin is reached at
 * `<slug>.<ADMIN_ROOT>`. `admin.calibra.app` in production; `admin.localhost` in dev (so
 * `aurora.admin.localhost:<port>` resolves to the `aurora` tenant's admin). Overridable via
 * `NEXT_PUBLIC_ADMIN_ROOT`.
 */
export const ADMIN_ROOT = (process.env.NEXT_PUBLIC_ADMIN_ROOT ?? "admin.calibra.app").toLowerCase();

/**
 * Where "Exit impersonation" sends a platform operator back to — the control plane console (Phase
 * 5). Falls back to the admin's own login when unset.
 */
export const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL ?? "";
