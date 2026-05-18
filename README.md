# Calibra Commerce

The agency's headless commerce baseline. Each client engagement starts from this repo: clone, rebrand, customise. pnpm + Turborepo + Next.js 16 + AdonisJS 6 + Postgres + Docker.

## What's inside

- [`apps/web`](./apps/web) — Next.js 16 storefront. App Router, RSC, Tailwind v4, next-intl (Persian default + English RTL toggle).
- [`apps/admin`](./apps/admin) — Next.js 16 admin panel. Intentionally different design language than the storefront. Persian default + English. Port 3001.
- [`apps/api`](./apps/api) — AdonisJS 6 backend. Lucid ORM on Postgres. VineJS validators. `@adonisjs/i18n` reads `Accept-Language` for localized responses. Run via Docker.
- [`packages/sdk`](./packages/sdk) — framework-agnostic TypeScript client for `apps/api`. Used by both `web` and `admin`. Forwards locale via `Accept-Language` automatically.
- [`packages/shared`](./packages/shared) — shared utilities + types only (`cn()`, locale registry). Not UI components — each frontend keeps its own design language.
- [`toolings/typescript`](./toolings/typescript) — shared `tsconfig` presets.

## Quickstart

Requires Node 24, pnpm 10, and Docker.

```sh
cp apps/api/.env.example   apps/api/.env
cp apps/web/.env.example   apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
# generate an APP_KEY for the API
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" >> apps/api/.env

just up
```

`just up` boots the AdonisJS API + Postgres in Docker and starts the storefront + admin dev servers. After it's running:

- Storefront → http://localhost:3000
- Admin → http://localhost:3001
- API → http://localhost:3333/health

To stop only the API stack (preserves DB volume): `just down`.

## Common tasks

```sh
pnpm build              # turbo build across the workspace
pnpm typecheck          # tsc --noEmit across the workspace
pnpm lint               # biome lint + sherif workspace lint
pnpm format:fix         # biome format --write
pnpm test               # vitest (frontend) + japa (API) across the workspace
just ready              # format + lint + typecheck + build + test (PR gate)
just api-ace 'migration:run'   # run pending Lucid migrations
just api-ace 'db:seed'         # seed sample data
```

## Customising per client

Calibra forks this repo per engagement. The agency-side rename steps:

1. Rename the `@calibra/*` npm scope to the client's scope (search-and-replace `@calibra/` → `@<client>/`).
2. Rebrand the storefront: edit `apps/web/messages/{en,fa}.json` (Site.name, taglines) and `apps/web/src/styles/globals.css` (theme tokens — accent color is the biggest lever).
3. Rebrand the admin: edit `apps/admin/messages/{en,fa}.json` and `apps/admin/src/styles/globals.css`.
4. If the API needs client-specific schema: add migrations under `apps/api/database/migrations/` and seeders under `apps/api/database/seeders/`.
5. Set Docker image tags and deployment URLs in CI.

## Deployment

No Vercel-specific glue — all three apps deploy via Docker:

- `apps/api/Dockerfile` → standalone Node bundle. Compose file in `apps/api/docker-compose.yml` is the production reference.
- `apps/web/Dockerfile` → Next.js standalone server. Build from repo root: `docker build -f apps/web/Dockerfile -t web .`
- `apps/admin/Dockerfile` → same pattern as `web`, port 3001.

## Conventions

Repo-wide conventions live in [`AGENTS.md`](./AGENTS.md). Each scope has its own `AGENTS.md` with rules that only apply inside it — read those before authoring there.

## License

[MIT](./LICENSE) © Calibra.
