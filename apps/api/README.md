# @calibra/api

AdonisJS 6 backend. Postgres + Lucid. Serves the storefront and admin panel via `/api/v1/*`.

## Quickstart

```sh
cp apps/api/.env.example apps/api/.env
# generate APP_KEY and paste it into apps/api/.env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

just api-up          # boots Postgres + API in docker
just api-wait        # (optional) waits until /health returns 200
```

Run the API directly against a local Postgres:

```sh
pnpm --filter @calibra/api dev
pnpm --filter @calibra/api migration:run
pnpm --filter @calibra/api db:seed
curl http://localhost:3333/api/v1/products | jq
```

See [`AGENTS.md`](./AGENTS.md) for the full layout, conventions, and the auth migration plan.
