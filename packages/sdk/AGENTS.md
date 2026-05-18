# packages/sdk

Framework-agnostic TypeScript client for the WooCommerce Store API and REST API. Runs in Node, the edge runtime, the browser, and React server components without a runtime check.

## Public surface

Re-exported from [`src/index.ts`](src/index.ts):

- `HttpClient` — low-level fetch wrapper. Sanitizes headers, drops `null` / `undefined` query params, throws `BackendError` on non-2xx.
- `createApiClient(options)` — high-level WooCommerce client. Bundles a configured `HttpClient` mounted at `${baseUrl}/wp-json/wc/store/v1` with typed `products` and `cart` namespaces.
- `BackendError` — error class with message-resolution fallback chain (`body.message` → `body.error` → `statusText` → `"Request failed"`).
- `getBaseUrl(override?)` — resolves the WordPress origin from `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL`. Throws if missing — refuses to silently default to a placeholder.
- Re-exported types from `@woocommerce/types`: `WcProduct`, `WcCart`, `WcCartItem`, `WcCartTotals`, `WcImage`, `WcPrices`.

Anything not re-exported from `src/index.ts` is private to the package.

## Types come from `@woocommerce/types`

Do not duplicate WooCommerce response shapes here. [`src/types.ts`](src/types.ts) re-exports from [`@woocommerce/types`](https://www.npmjs.com/package/@woocommerce/types) (the same package WooCommerce Blocks uses internally). If you need a richer shape (variations, attributes, payment methods), import it directly from `@woocommerce/types` in the consuming module rather than widening our re-export.

## Invariants

- **Framework-agnostic.** No React, no Next.js, no browser-only globals. Only `fetch`, `URLSearchParams`, `Response`, `btoa` (with a `Buffer` fallback) — available everywhere we run.
- **Header sanitization.** `undefined` / `null` / empty-string header values are dropped before the request goes out. Callers can pass `cartToken: someToken ?? undefined` without poisoning the request.
- **Query string drop.** `null` and `undefined` query values are skipped entirely, not serialized as `"null"` or `"undefined"`.
- **`BackendError` fallback chain.** Never bubble up a bare `Error`. If the response is non-2xx or fetch throws, wrap it in a `BackendError` so callers always get a `status`, `body`, and a human-readable `message`.
- **Store API for storefront, REST API for admin.** The high-level `products` / `cart` namespaces hit `/wp-json/wc/store/v1` (public, cart-token-scoped — perfect for headless). For admin endpoints (`/wp-json/wc/v3/*`) use the returned `http` field directly; pass `consumerKey` + `consumerSecret` to `createApiClient` to get Basic-auth applied automatically.

## Style

- `interface` for object shapes intended to be extended; `type` for unions / mapped types.
- All exported declarations get a JSDoc block (the package is consumed as a library).
- Tests live next to source as `*.test.ts` and run with `vitest`.
