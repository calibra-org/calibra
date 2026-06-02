# packages/sdk

Framework-agnostic TypeScript client for the [`@calibra/api`](../../apps/api) AdonisJS backend. Used by both the storefront ([`apps/web`](../../apps/web)) and the admin panel ([`apps/admin`](../../apps/admin)). Runs in Node, the edge runtime, the browser, and React server components without a runtime check.

## Public surface

Re-exported from [`src/index.ts`](src/index.ts):

- `createApiClient(options)` — high-level entry point. Returns `{ http, storefront, admin, platform }` sharing the same baseUrl, locale, and bearer token.
- `createStorefrontClient(options)` / `createAdminClient(options)` / `createPlatformClient(options)` — typed `openapi-fetch` clients pinned to the generated `paths`. Use directly when you only need one surface. The `platform` surface is the control-plane API (`/api/v1/platform/*`); its token is a `pat_`-prefixed platform token, not a tenant bearer token.
- `HttpClient` — low-level fetch wrapper. Sanitizes headers, drops `null` / `undefined` query params, throws `BackendError` on non-2xx. Kept as an escape hatch for endpoints not yet in the OpenAPI spec.
- `BackendError` — error class with message-resolution fallback chain (`body.message` → `body.error` → `statusText` → `"Request failed"`).
- `getBaseUrl(override?)` — resolves the API origin from `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL`. Throws if missing.
- `unwrapResource(envelope)` / `unwrapPaginated(envelope)` — small helpers for the `{ data }` / `{ data, meta }` envelopes.
- Types: `StorefrontSchemas` / `AdminSchemas` / `PlatformSchemas` (alias for `components` in the generated files), matching `*Paths` and `*Operations` aliases, plus the structural `Resource<T>`, `Paginated<T>`, `MoneyMinor`.

Anything not re-exported from `src/index.ts` is private to the package.

## Contract with the API

**The OpenAPI spec is the source of truth.** [`docs/api/reference/openapi/storefront.v1.yaml`](../../docs/api/reference/openapi/storefront.v1.yaml), `admin.v1.yaml`, and `platform.v1.yaml` are bundled into JSON by `@calibra/api-docs`, then turned into typed `paths` / `components` via `openapi-typescript`. The output lives in [`src/generated/`](src/generated) and is committed.

Two response envelopes recur across the API:

- `{ data: T, ... }` — single-resource. Use `Resource<T>` / `unwrapResource`.
- `{ data: T[], meta: { page, limit, total, lastPage } }` — paginated list. Use `Paginated<T>` / `unwrapPaginated`. The wire request key is `?limit=N`; the response meta uses the same identifier.

## Codegen workflow

```sh
pnpm --filter @calibra/sdk codegen          # rebuild spec JSON + .d.ts files
pnpm --filter @calibra/sdk codegen:check    # asserts no drift between spec and .d.ts
```

`codegen:check` regenerates and `git diff --exit-code`s — CI invokes it after lint/format so drift fails the build. `pnpm build` runs `codegen` automatically via `prebuild`.

**Never edit `src/generated/*.d.ts` by hand.** If the output is wrong, the spec is wrong — fix the spec in `docs/api/reference/openapi/` and regenerate.

## Invariants

- **Framework-agnostic.** No React, no Next.js, no browser-only globals. Only `fetch`, `URLSearchParams`, `Response` — available everywhere we run. No react-query / SWR / Zustand.
- **Header sanitization.** `undefined` / `null` / empty-string header values are dropped before the request goes out. Callers can pass `authorization: token ? \`Bearer ${token}\` : undefined` without poisoning the request. Applies to both `HttpClient` and the openapi-fetch clients (shared `internal/sanitize.ts`).
- **Query string drop.** `null` and `undefined` query values are skipped entirely, not serialized as `"null"` or `"undefined"`.
- **`BackendError` fallback chain.** Never bubble up a bare `Error`. Non-2xx responses throw `BackendError` in both the low-level and typed clients — openapi-fetch's `{ data, error }` discriminant is intercepted by middleware so consumer code is consistent.
- **Money in minor units.** Every price is an integer in the smallest currency unit (cents, rials, …). Never floats. `MoneyMinor` is a semantic alias for `number`.

## Style

- `interface` for object shapes intended to be extended; `type` for unions / mapped types.
- All exported declarations get a JSDoc block (the package is consumed as a library).
- Tests live next to source as `*.test.ts` and run with `vitest`.
