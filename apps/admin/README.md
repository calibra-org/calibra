# @calibra/admin

Next.js 16 admin panel. Tailwind v4, next-intl (Persian default + English secondary), reads the AdonisJS API through `@calibra/sdk`. Port 3001.

## Quickstart

```sh
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @calibra/admin dev    # http://localhost:3001
```

Or boot the whole infra at once from the repo root:

```sh
just up
```

See [`AGENTS.md`](./AGENTS.md) for layout, conventions, and Docker deployment.
