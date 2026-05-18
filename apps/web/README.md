# @calibra/web

Next.js 16 storefront. App Router, Tailwind v4, next-intl (English default + Persian RTL).

## Quickstart

```sh
cp apps/web/.env.example apps/web/.env.local
pnpm dev          # boots http://localhost:3000
```

Requires the WordPress backend in [`apps/cms`](../cms) to be running for live data. From the repo root:

```sh
just up           # boots WordPress (docker) + Next.js together
```

## Build

```sh
pnpm --filter @calibra/web build       # next build → .next/standalone/
docker build -f apps/web/Dockerfile -t web .   # production image
```

See [`AGENTS.md`](./AGENTS.md) for the layered `src/` map and authoring conventions.
