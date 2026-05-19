# @calibra/sdk

Framework-agnostic TypeScript client for the [`@calibra/api`](../../apps/api) AdonisJS backend. Used by `apps/web` and `apps/admin` to talk to the API.

## Usage

```ts
import { createApiClient } from "@calibra/sdk";

const api = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    locale: "fa",
    token: getSessionToken(),
});

// Storefront — path + params + body + response all inferred from storefront.v1.yaml
const { data } = await api.storefront.GET("/api/v1/catalog/products", {
    params: { query: { page: 1, perPage: 24 } },
});

// Admin — typed against admin.v1.yaml
const { data: order } = await api.admin.GET("/api/v1/admin/orders/{id}", {
    params: { path: { id: 123 } },
});
```

Non-2xx responses throw [`BackendError`](src/BackendError.ts) — the typed `{ error }` discriminant from openapi-fetch is intercepted by middleware so callers can rely on Promise rejection.

For endpoints not yet in the spec, drop down to the low-level client:

```ts
const stats = await api.http.get<{ ordersToday: number }>("/admin/stats");
```

## Types

Schema types are re-exported under namespaced aliases so call sites can pull them in directly:

```ts
import type { StorefrontSchemas, AdminSchemas } from "@calibra/sdk";

type Product = StorefrontSchemas["Product"];
type AdminOrder = AdminSchemas["Order"];
```

## Codegen

The generated `src/generated/{storefront,admin}.d.ts` files are committed. Regenerate them from the live specs:

```sh
pnpm --filter @calibra/sdk codegen          # rebuild the spec JSON + .d.ts files
pnpm --filter @calibra/sdk codegen:check    # CI guard — fails on drift
```

`pnpm build` runs `codegen` automatically (via `prebuild`).
