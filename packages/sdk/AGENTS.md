# packages/sdk

Framework-agnostic TypeScript client for the [`@calibra/api`](../../apps/api) AdonisJS backend. Used by both the storefront ([`apps/web`](../../apps/web)) and the admin panel ([`apps/admin`](../../apps/admin)). Runs in Node, the edge runtime, the browser, and React server components without a runtime check.

## Public surface

Re-exported from [`src/index.ts`](src/index.ts):

- `HttpClient` — low-level fetch wrapper. Sanitizes headers, drops `null` / `undefined` query params, throws `BackendError` on non-2xx.
- `createApiClient(options)` — high-level client. Bundles a configured `HttpClient` mounted at `${baseUrl}/api/v1` with typed `products` and `cart` namespaces.
- `BackendError` — error class with message-resolution fallback chain (`body.message` → `body.error` → `statusText` → `"Request failed"`).
- `getBaseUrl(override?)` — resolves the API origin from `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL`. Throws if missing — refuses to silently default to a placeholder.
- Types: `Product`, `Cart`, `CartLine`, `MoneyMinor`, `Paginated<T>`, `Resource<T>`.

Anything not re-exported from `src/index.ts` is private to the package.

## Contract with the API

Types in [`src/types.ts`](src/types.ts) mirror the response shapes returned by controllers in [`apps/api/app/controllers/`](../../apps/api/app/controllers/). If a controller adds a field, add it here in the same PR — types are the contract between the API and its consumers.

Two response envelopes are used across the API:

- `{ data: T, ... }` — single-resource. Type as `Resource<T>`.
- `{ data: T[], meta: { page, perPage, total, lastPage } }` — paginated list. Type as `Paginated<T>`.

The SDK's high-level methods unwrap `data` for single-resource calls (so callers get `Product`, not `Resource<Product>`); list calls return the full `Paginated<T>` envelope so callers can render pagination UI.

## Invariants

- **Framework-agnostic.** No React, no Next.js, no browser-only globals. Only `fetch`, `URLSearchParams`, `Response` — available everywhere we run.
- **Header sanitization.** `undefined` / `null` / empty-string header values are dropped before the request goes out. Callers can pass `authorization: token ? \`Bearer ${token}\` : undefined` without poisoning the request.
- **Query string drop.** `null` and `undefined` query values are skipped entirely, not serialized as `"null"` or `"undefined"`.
- **`BackendError` fallback chain.** Never bubble up a bare `Error`. If the response is non-2xx or fetch throws, wrap it in a `BackendError` so callers always get a `status`, `body`, and a human-readable `message`.
- **Money in minor units.** Every price is an integer in the smallest currency unit (cents, rials, …). Never floats. The SDK exposes `MoneyMinor` (alias for `number`) so the intent is documented at the type level.

## Style

- `interface` for object shapes intended to be extended; `type` for unions / mapped types.
- All exported declarations get a JSDoc block (the package is consumed as a library).
- Tests live next to source as `*.test.ts` and run with `vitest`.
