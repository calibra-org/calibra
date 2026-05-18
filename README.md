# shop

Headless commerce monorepo baseline. **WordPress + WooCommerce** backend behind a **Next.js 16** storefront. pnpm + Turborepo + Tailwind v4 + next-intl (English default, Persian RTL).

## What's inside

- [`apps/web`](./apps/web) — Next.js 16 storefront (App Router, RSC, Tailwind v4, next-intl).
- [`apps/cms`](./apps/cms) — WordPress + WooCommerce + Polylang backend, run via Docker.
- [`packages/sdk`](./packages/sdk) — framework-agnostic TypeScript client for the WooCommerce Store + REST APIs.
- [`toolings/typescript`](./toolings/typescript) — shared `tsconfig` presets.

## Quickstart

Requires Node 24, pnpm 10, and Docker (for the WordPress backend).

```sh
pnpm install
just up           # boots WordPress (docker) + Next.js dev server
```

After first boot, finish the WordPress install wizard at `http://localhost:8080/wp-admin/` — the `mu-bootstrap.php` plugin then auto-installs WooCommerce + Polylang. The storefront is at `http://localhost:3000`.

Just running the storefront alone (when the backend is already up elsewhere):

```sh
pnpm dev          # starts apps/web on http://localhost:3000
```

Common tasks (also available as `just` recipes):

```sh
pnpm build        # turbo build across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm lint         # biome lint + sherif workspace lint
pnpm format:fix   # biome format --write
pnpm test         # vitest across the workspace
```

## Conventions

Repo-wide conventions live in [`AGENTS.md`](./AGENTS.md). Each scope (app or package) has its own `AGENTS.md` with rules that only apply inside it — read those before authoring there.

## Deployment

There's no Vercel-specific glue — both apps deploy via Docker:

- `apps/web/Dockerfile` builds a self-contained Next.js standalone server. Build from the repo root: `docker build -f apps/web/Dockerfile -t shop-web .`
- `apps/cms/Dockerfile` extends the official WordPress image; `apps/cms/docker-compose.yml` brings the stack up locally and serves as the production reference.

## License

[MIT](./LICENSE) © shop.
