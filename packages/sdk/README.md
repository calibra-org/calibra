# @calibra/sdk

Framework-agnostic TypeScript client for the [`@calibra/api`](../../apps/api) AdonisJS backend. Used by `apps/web` and `apps/admin` to talk to the API.

## Usage

```ts
import { createApiClient } from "@calibra/sdk";

const api = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    token: getSessionToken(),
});

const products = await api.products.list({ per_page: 24 });
const cart = await api.cart.addLine(cartId, { productId: 42, quantity: 1 });
```

For endpoints not yet wrapped, drop down to the low-level client:

```ts
const stats = await api.http.get<{ ordersToday: number }>("/admin/stats");
```
