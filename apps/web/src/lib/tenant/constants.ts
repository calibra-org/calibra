/**
 * Request header the middleware sets after resolving the `Host` to a tenant. `apiServer()` forwards
 * it on every API call so the backend scopes the request (RULE A — Host is the source of tenant
 * truth). The backend also accepts it as `X-Calibra-Tenant`; HTTP header names are case-insensitive.
 */
export const TENANT_HEADER = "x-calibra-tenant";

/**
 * Request header carrying the already-validated tenant profile + branding (JSON) from the middleware
 * to the server components. Lets the layout theme the page without a second API round-trip — the
 * middleware fetched it once to gate routing.
 */
export const TENANT_DATA_HEADER = "x-calibra-tenant-data";

/**
 * The template this deployment implements (RULE C). `apps/web` serves every tenant whose
 * `template_key` matches; a tenant routed here with a different template renders the misrouted state.
 */
export const TEMPLATE_KEY = process.env.NEXT_PUBLIC_TEMPLATE_KEY ?? "default";

/**
 * Root domain under which shop subdomains live, i.e. a shop is reached at `<slug>.<SHOPS_ROOT>`.
 * `shops.calibra.app` in production; `shops.localhost` in dev (so `aurora.shops.localhost` resolves
 * to the `aurora` tenant). Overridable via `NEXT_PUBLIC_SHOPS_ROOT`.
 */
export const SHOPS_ROOT = (process.env.NEXT_PUBLIC_SHOPS_ROOT ?? "shops.calibra.app").toLowerCase();
