# @shop/sdk

Framework-agnostic TypeScript client for the WooCommerce Store API and REST API. Used by `apps/web` to talk to the WordPress backend in `apps/cms`.

## Usage

```ts
import { createApiClient } from "@shop/sdk";

const wc = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    cartToken: getCartTokenFromCookie(),
});

const products = await wc.products.list({ per_page: 24 });
const cart = await wc.cart.addItem({ id: 42, quantity: 1 });
```

For admin endpoints (`/wp-json/wc/v3/*`) pass `consumerKey` + `consumerSecret` — Basic auth is applied automatically.
