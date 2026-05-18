# apps/api

AdonisJS 6 backend. Source of truth for products, orders, customers, auth, and admin operations. Both the [storefront](../web) and the [admin panel](../admin) talk to it through [`@calibra/sdk`](../../packages/sdk).

## Stack

- **AdonisJS 6** (TypeScript, ESM, hot-reload via `hot-hook`).
- **Lucid 21** ORM on **PostgreSQL 17**.
- **VineJS** for request validation.
- **Japa** for unit + functional tests, with `apiClient` for HTTP assertions.
- **Pino** structured logging (pretty in dev, ndjson in production).

## Layout

```
apps/api/
├── adonisrc.ts                    # providers / preloads / test suites / experimental flags
├── ace.js                         # `node ace …` entry (delegates to bin/console.js)
├── bin/
│   ├── server.ts                  # HTTP entry — `node bin/server.js`
│   ├── console.ts                 # Ace entry — booted by `node ace …`
│   └── test.ts                    # Japa entry — booted by `node ace test`
├── start/
│   ├── env.ts                     # validated env (every env key must be declared here)
│   ├── kernel.ts                  # server + router middleware stacks
│   └── routes.ts                  # /api/v1/* route table + /health
├── config/                        # app, bodyparser, cors, hash, logger, database
├── app/
│   ├── controllers/               # one class per resource (snake_case_controller.ts)
│   ├── exceptions/handler.ts      # global error handler
│   ├── middleware/                # request middleware (auto-snake_cased filenames)
│   ├── models/                    # Lucid models
│   └── validators/                # VineJS schemas (extract from controllers as they grow)
├── database/
│   ├── migrations/                # timestamped — never edit a migration after it's run
│   └── seeders/                   # idempotent — use `updateOrCreate` over `create`
├── tests/
│   ├── bootstrap.ts               # Japa plugins + lifecycle hooks
│   └── functional/                # API tests via @japa/api-client
├── Dockerfile                     # multi-stage → built JS in `build/`
├── docker-compose.yml             # api + postgres
├── .env.example                   # copy to .env (git-ignored)
└── tsconfig.json                  # extends @adonisjs/tsconfig/tsconfig.app.json
```

## Conventions

- **Subpath imports.** Every internal import goes through the `#namespace/*` aliases declared in `package.json#imports` (e.g. `#controllers/products_controller`, `#models/product`, `#start/env`). Never use deep relative paths like `../../models/product`. Ace scaffolds (`node ace make:controller`) already follow this convention.
- **Filenames are `snake_case.ts`.** Controllers end with `_controller.ts`, middleware with `_middleware.ts`, models stay singular (`product.ts`), validators with `_validator.ts`. Class names stay PascalCase.
- **Versioned routes.** Public endpoints sit under `/api/v1/*` (defined in `start/routes.ts`). Liveness probe at `/health` is unversioned. Breaking changes go behind `/api/v2/*` rather than mutating v1.
- **Money in integer minor units.** Every price column is `int` cents in the DB and an integer in the model. Convert to a major-unit string only at the JSON response edge.
- **Validators are VineJS, called inside the controller** until they grow more than a handful of lines — then they get extracted into `app/validators/<resource>_validator.ts` and imported.
- **Migrations are immutable once shipped.** Use a new migration to alter an existing table, never edit history. Seeders must be idempotent (`updateOrCreate`, not `create`).
- **Pagination response envelope:** `{ data: T[], meta: { page, perPage, total, lastPage } }`. The SDK's `Paginated<T>` matches this exactly — keep them in sync.

## Common commands

```sh
# Dev
just api-up                          # boot Postgres + API (docker)
just api-down                        # stop and preserve volumes
just api-logs                        # tail the api container
just api-reset                       # nuke volumes (loses all data)

# From inside apps/api/
pnpm dev                             # node ace serve --hmr
pnpm test                            # japa
pnpm typecheck                       # tsc --noEmit
node ace make:controller orders      # scaffold a controller
node ace make:model Order -m         # model + migration in one go
node ace migration:run               # apply pending migrations
node ace db:seed                     # run all seeders
```

## Auth (next milestone)

`@adonisjs/auth@9` is installed but not yet wired. When adding auth:

1. `node ace configure @adonisjs/auth --guard=access_tokens` (API token guard is the right default for storefront + admin clients).
2. Add a `User` model + `users` migration; reference it from `config/auth.ts`.
3. Mount login routes (`POST /api/v1/auth/login`, `POST /api/v1/auth/logout`) and the `auth` middleware in `start/kernel.ts`.
4. Surface a session helper in `@calibra/sdk` that stores the token and forwards it as `Authorization: Bearer <token>`.
