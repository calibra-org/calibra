# apps/api

AdonisJS 7 backend. Source of truth for products, orders, customers, auth, and admin operations. Both the [storefront](../web) and the [admin panel](../admin) talk to it through [`@calibra/sdk`](../../packages/sdk).

## Stack

- **AdonisJS 7** (TypeScript ESM, hot-reload via `hot-hook`, `@poppinss/ts-exec` as the JIT loader).
- **`@adonisjs/bouncer`** — abilities under `app/abilities/main.ts` enforce per-row ownership. Throw via `ctx.bouncer.authorize(ability, resource)` from controllers; the framework's self-handled `E_AUTHORIZATION_FAILURE` turns into a 403. Use a `findOrFail` + `authorize` pair instead of inline `where("user_id", ctx.auth.user!.id)` lookups.
- **`@adonisjs/limiter`** — named limiters in `start/limiter.ts` (auth/login_email/payments/webhooks/admin_writes). Apply per-route via `.use(limiterName)`. The bootstrap clears the memory store between specs so tests don't collide.
- **`@adonisjs/shield`** — security headers (CSP report-only, HSTS, X-Frame DENY, X-Content-Type nosniff). CSRF is disabled — bearer-token API has no cookie surface.
- **`@adonisjs/lock`** — distributed mutex via `lock.createLock(key, ttl).runImmediately(callback)`. Wrap any critical section where two concurrent requests with the same id would corrupt state (import rollback, refund issuance, PSP verify). Returns `[acquired, result]`; treat `acquired=false` as 409.
- **`@adonisjs/core/health`** — `/health/live` + `/health/ready`. The ready probe runs registered checks from `start/health.ts` (DB, Redis, memory, disk) and returns 503 on degraded.
- **`@adonisjs/otel`** — env-gated. `OTEL_EXPORTER_OTLP_ENDPOINT` enables tracing; pointed at any OTLP collector (Tempo, Jaeger, Grafana Cloud free tier). Error reporting today is Pino structured logs only; a Sentry-protocol receiver like GlitchTip can be wired later if/when needed.
- **Domain events** — `app/events/<event>.ts` subclasses `BaseEvent`. Listeners register in `start/events.ts`. Use events to decouple side effects (audit log writes, broadcasts) from the request flow.
- **Domain exceptions** — `app/exceptions/domain_exceptions.ts` provides `ResourceNotFound` (404), `ResourceConflict` (409), `ResourceGone` (410), `BusinessRule` (422). Each self-handles to the consistent `{ errors: [{ message, code, ...meta }] }` envelope.
- **Request ID** — every response carries `X-Request-Id`; the global exception handler tags Sentry with it. Upstream-provided IDs (load balancer, Cloudflare) are honoured verbatim.
- **Lucid 22** ORM on **PostgreSQL 17**. v22 auto-generates `database/schema.ts` from migrations — models extend the generated `<Entity>Schema` classes (column types come for free, no hand-maintained `@column` boilerplate).
- **VineJS 4** for request validation. Schemas compile once at module scope.
- **`@adonisjs/auth` 10** with the `access_tokens` guard (configured on first wiring — see "Auth" below).
- **`@adonisjs/i18n` 3** wired; the active locale is on `ctx.i18n` (set by the `detect_user_locale_middleware` from the `Accept-Language` header). API `defaultLocale` is `"fa"` — see `config/i18n.ts`.
- **`@adonisjs/cors` 3** + **encryption** (`config/encryption.ts`, chacha20 driver).
- **Japa 5** for unit + functional tests, with **`@japa/api-client` 3** for real-HTTP assertions through the wired router. **Model factories** live under `database/factories/`.
- **AdonisJS Transformers** (first-party in v7 — `https://docs.adonisjs.com/guides/frontend/transformers`) shape every API response. Each resource gets a class extending `BaseTransformer<T>` under `app/transformers/`. Sensitive columns are never picked, so they cannot leak. Controllers stay one-liners: `return serialize(ProductTransformer.transform(products))` (or `.paginate(paginator)` for paginated responses).
- **Pino** structured logging (pretty in dev, ndjson in production).

Local docs cache for the agent doing the work: `~/adonis-v7-docs/content/` (framework) and `~/adonis-lucid-docs/content/docs/` (ORM). Read those before reaching for memory.

## Caching (`@adonisjs/cache` / Bentocache)

The api uses `@adonisjs/cache` (Bentocache under the hood) configured as a **multi-tier store**: in-memory L1 + Redis L2 + Redis bus, defined in `config/cache.ts`. The bus keeps the L1 layer of every process (api + queue worker + future replicas) coherent — when one writes, the others evict.

**Default story** for read endpoints: wrap the heavy fetch in `cache.getOrSet({ key, ttl, grace, tags, factory })`. The factory only runs on a real miss; stampede protection means 10,000 simultaneous misses still produce one query. Set a `grace` window so a brief Postgres / Redis hiccup serves slightly-stale data instead of a 500 — this is a UX feature, not a perf hack.

**The "never cache" list** — these read paths mutate per request or carry correctness consequences if stale:
- Cart contents (per-session mutation surface).
- `inventory_items.stock_status` (oversell risk).
- Order detail/list/history, payment attempts, refunds (legal/financial state).
- Authenticated `/account/*` (per-user, low cache hit rate, high freshness expectation).
- Customer notes, customer timeline (admin operators expect live data).

When in doubt, ask: **"if this is 30 seconds stale, does a user see a wrong price, oversell, or wrong status?"** If yes → don't cache, or cache with `grace: undefined` and a sub-minute TTL.

**Keys + tags** live in `app/services/cache_keys.ts`. Always go through the builders — no inline string templates in controllers. Every key includes the locale segment (`fa` / `en`) because Persian and English responses are different bytes. Filter keys are built from a **sorted, normalized** parameter object so `?a=1&b=2` and `?b=2&a=1` collide.

**Invalidation is the contract.** Every write path must `cache.deleteByTag({ tags: [...] })` for the tags it touches. The mapping lives next to the tag constants in `cache_keys.ts`; wire it through domain events (`app/events/*`) where possible so a refund issued via any controller invalidates correctly. **A new read endpoint without a paired tag and a write-path invalidation is a bug — it ships stale data the moment anything changes.**

**Tests are mandatory.** Every cached endpoint needs a Japa functional test covering: (1) cold-miss populates the cache, (2) warm-hit doesn't re-query, (3) tag invalidation after a write returns fresh data, (4) the cached response still passes `assertAgainstApiSpec()`.

**Tunable defaults** (`config/cache.ts`): `ttl: "5m"`, `grace: "24h"`, `graceBackoff: "30s"`, soft `timeout: "200ms"`, `hardTimeout: "2s"`. Override per call when the data has different freshness needs (taxonomy → `30m`, admin counts → `2m`, shipping → `5m` no grace, single-use values → `pull`).

**Ace ops**: `node ace cache:clear` (whole store), `cache:clear --tags=catalog:products` (targeted), `cache:delete <key>` (surgical), `cache:prune` (n/a for Redis, only DB driver).

**Local docs cache**: `~/adonis-v7-docs/content/guides/digging_deeper/cache.md` (framework integration) and `~/Julien-R44/bentocache/docs/content/docs/` (engine details — grace, stampede, multi-tier, tags, namespaces, adaptive caching). Read these before reaching for memory.

## Local observability & search (per-spin)

Every `pnpm spin <slug>` brings up a full prod-parity infra alongside the app:

- **Caddy** terminates TLS for every service with an internal CA. All UIs reachable at `https://<service>.<slug>.spin.localhost`. Run `caddy trust` once on your machine to trust the local root. Bare ports still work as escape hatches; the hostname route is the prod-parity path.
- **GlitchTip** (Sentry-protocol) — errors thrown via `@sentry/node` show up at `errors.<slug>.spin.localhost`. The DSN is written to `apps/api/.env` as `GLITCHTIP_DSN` once the operator registers + creates an org/project on first run (auto-provisioning is on the roadmap; the handoff card prints the one-time setup blurb). Anything you'd report in prod, report locally too — that's how we catch silent error-handler regressions.
- **Prometheus + Grafana + Loki + Tempo + Alertmanager** — the api exposes `/metrics` (Prometheus text format), tees ndjson logs to `<worktree>/.spin/logs/api.ndjson` (Promtail → Loki), and emits OTLP traces to Tempo (the OTLP/HTTP receiver is published on the `tempo` port; the HTTP API is fronted by Caddy for Grafana datasource access). The starter Grafana dashboard "Calibra api — request overview" loads on first visit. Adding a new dashboard? Commit it to `docker/observability/grafana/dashboards/` — clickops dashboards aren't reproducible.
- **Uptime Kuma** runs an external probe against `/health/ready`. Configure additional probes via the UI; the config is per-spin (lives in the spin's docker volume).
- **Meilisearch** runs on `search.<slug>.spin.localhost`. The api auto-discovers it via `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` (`config/env.ts`); the singleton client lives in `app/services/meilisearch.ts`. Reindex flows go through the search-index service (lands in a follow-up PR).

**Production parity is the contract.** Production will use the same images (Caddy, Grafana, Prometheus, Loki, Tempo, GlitchTip, Meilisearch) reached via real hostnames behind Cloudflare/Arvan. If a feature behaves differently in your spin than it does on staging, that's a dev-env bug — file it, don't paper over it.

**Stack down**: `pnpm spin stop <slug>` stops everything. `--purge` drops the data volumes (Grafana dashboards you didn't commit, Meilisearch index, Loki history, GlitchTip events). Commit anything you want to keep.

**Direct-port escape hatches** (in addition to the Caddy routes): `localhost:<api>`, `localhost:<redis>`, `localhost:<mailpit-web>`, `localhost:<adminer>`, `localhost:<redisinsight>`, `localhost:<meilisearch>`. Useful for `curl`, `redis-cli`, `psql`, and HMR. Other UIs are intentionally Caddy-only — go through the hostname.

**Sentry/Pino layering** — Pino remains the structured-logging primary; Sentry/GlitchTip captures exceptions and tracks regressions. Don't log AND `Sentry.captureException` for the same event from controllers; the global exception handler already does both. Use `Sentry.captureMessage()` only for non-throw notable events (e.g. a fallback path firing).

## Layout

```
apps/api/
├── adonisrc.ts                    # providers / preloads / test suites / v7 hooks (indexEntities)
├── ace.js                         # node ace entry — loads @poppinss/ts-exec then bin/console.ts
├── .adonisjs/                     # generated barrels (gitignored) — powers #generated/* imports
├── bin/
│   ├── server.ts                  # HTTP entry — `node bin/server.js`
│   ├── console.ts                 # Ace entry — booted by `node ace …`
│   └── test.ts                    # Japa entry — booted by `node ace test`
├── start/
│   ├── env.ts                     # validated env (every env key must be declared here)
│   ├── kernel.ts                  # server + router middleware stacks (named middleware map)
│   ├── routes.ts                  # /health + per-domain route file imports
│   └── routes/                    # per-domain route files (added as phases ship)
├── config/                        # app, bodyparser, cors, hash, logger, database, i18n, encryption, auth
├── app/
│   ├── controllers/               # one class per resource (snake_case_controller.ts)
│   ├── exceptions/handler.ts      # global error handler
│   ├── middleware/                # request middleware (auto-snake_cased filenames)
│   ├── models/                    # Lucid models; each extends its <Entity>Schema from #database/schema
│   ├── transformers/              # BaseTransformer<T> subclasses — owns API response shape
│   ├── validators/                # VineJS schemas (extract from controllers as they grow)
│   ├── services/                  # plain domain services (settings, slug, inventory, …)
│   └── enums/                     # shared enums (e.g. OrderStatus)
├── database/
│   ├── migrations/                # timestamped — never edit a migration after it's run
│   ├── seeders/                   # idempotent — use `updateOrCreate` over `create`
│   ├── factories/                 # Lucid model factories for tests (`UserFactory`, `ProductFactory`, …)
│   └── schema.ts                  # auto-generated by `node ace migration:run` (gitignored)
├── resources/lang/{fa,en}/        # i18n catalogs (`messages.json` per locale)
├── tests/
│   ├── bootstrap.ts               # Japa plugins + lifecycle hooks
│   ├── unit/                      # `*.spec.{ts,js}`
│   └── functional/                # HTTP tests via @japa/api-client (`*.spec.{ts,js}`)
├── Dockerfile                     # multi-stage → standalone build via `pnpm deploy`
├── docker-compose.yml             # dev infra only: Postgres + pgAdmin (API runs on host via HMR)
├── .env.example                   # copy to .env (git-ignored)
└── tsconfig.json                  # extends @adonisjs/tsconfig/tsconfig.app.json
```

## Conventions

- **Subpath imports.** Every internal import goes through the `#namespace/*` aliases declared in `package.json#imports`. Available aliases: `#controllers/*`, `#exceptions/*`, `#models/*`, `#services/*`, `#middleware/*`, `#validators/*`, `#transformers/*`, `#providers/*`, `#database/*`, `#start/*`, `#tests/*`, `#config/*`, `#generated/*`. Never use deep relative paths like `../../models/product`. Ace scaffolds already follow this.
- **Filenames are `snake_case.ts`.** Controllers end with `_controller.ts`, middleware with `_middleware.ts`, models stay singular (`product.ts`), validators with `_validator.ts`, transformers with `_transformer.ts`. Class names stay PascalCase.
- **Models extend the generated schema class.** After `node ace migration:run`, `database/schema.ts` is regenerated with one `<Entity>Schema` per table. The hand-written model just does `class Product extends ProductSchema { /* relationships, hooks, computed */ }`. Don't redeclare columns the schema class already covers.
- **Transformers own response shape.** Never hand-build JSON objects in controllers. Each resource gets `app/transformers/<resource>_transformer.ts` extending `BaseTransformer<T>` with `toObject()` + variant methods (`forList`, `forDetail`, `forAdmin`). Sensitive fields are simply not picked.
- **Versioned routes.** Public endpoints sit under `/api/v1/*`. Liveness probe at `/health` is unversioned. Breaking changes go behind `/api/v2/*` rather than mutating v1. Each domain has its own file under `start/routes/<domain>.ts` imported from `start/routes.ts`.
- **Money in integer minor units.** Every monetary column is `BIGINT` Rial minor units. Convert to a major-unit string only at the JSON response edge (inside the transformer).
- **Validators are VineJS, called inside the controller** until they grow more than a handful of lines — then extract into `app/validators/<resource>_validator.ts` and import.
- **Every new list / paginated endpoint goes through the TableView primitive** (`#lib/table_view`). Declare a view under `app/table_views/<scope>/<resource>.ts` with the filterable / orderable columns + `defaultSort`, wrap `view.schema` in your validator (spread `view.schema.getProperties()` and add any endpoint extras like `q` / `tab` / `trashed`), then call `view.run(prebuiltBuilder, parsed)` from the controller. The shared wire grammar (`filter[]=field:op:value`, `filterOr[]=…`, `sort[]=field:dir`, `page`, `limit`) is uniform across resources. Full guide + worked examples + migration status in [`app/lib/table_view/README.md`](app/lib/table_view/README.md).
- **Migrations are immutable once shipped.** Use a new migration to alter an existing table, never edit history. Seeders must be idempotent (`updateOrCreate`, not `create`).
- **Pagination response envelope:** `{ data: T[], meta: { page, perPage, total, lastPage } }` — produced by `Transformer.paginate(paginator)`. The SDK's `Paginated<T>` matches this exactly; keep them in sync.
- **Every new endpoint ships with a Japa functional test.** Mandatory, no exceptions. Live under `tests/functional/<domain>/<resource>.spec.ts` (mirror the controller layout — e.g. `app/controllers/admin/reports_controller.ts` → `tests/functional/admin/reports.spec.ts`). Cover at minimum: the unauthenticated 401, an unauthorized 403 (if the route is admin-only or otherwise gated), the happy-path 200 with `response.assertAgainstApiSpec()` (this is what enforces the schema is real), and each meaningful query/filter dimension as its own test. Don't open a PR with a new endpoint and "I tested manually with curl" — the spec assertion *is* the contract and CI runs it.
- **Response shapes are named components, never inlined.** Anything that returns a domain object (product row, report row, range window, …) gets a schema file at `docs/api/reference/openapi/common/components/schemas/<Entity>.yaml` and is `$ref`'d from the path file. Inlined `properties: { ... }` blocks in path files are a code smell — they hide the entity, prevent reuse, bloat the bundle, and produce anonymous types in the generated SDK. The litmus test: if the same shape might appear in a sibling endpoint *ever*, extract now. Examples already in `common/components/schemas/`: `Money`, `PaginationMeta`, `Address`, `Region`, `Translation`, `BasicMessage`, `ValidationErrorMessage`, `TopProduct`, `ReportRange`.

## Common commands

```sh
# Dev infra (Postgres + pgAdmin in docker)
just db-up                              # block until db is healthy
just db-down                            # stop (volumes persist)
just db-reset                           # nuke volumes + re-migrate
just db-shell                           # psql inside the db container
just db-logs                            # tail postgres logs

# Dev servers (host)
just up                                 # db + migrate + web + admin + api (turbo, parallel)
just up-api                             # db + migrate + api only
pnpm --filter @calibra/api dev          # api only (node ace serve --hmr)

# Lucid + Ace
just migrate                            # node ace migration:run
just migrate-rollback                   # node ace migration:rollback
just seed                               # node ace db:seed (runs MainSeeder — small demo dataset)
just ace 'db:bulk-seed'                 # ~100k products / 500k users + 20 admins / ~100k orders (derived from --users at 20%); idempotent, opt-in
just ace 'db:bulk-seed --reset'         # wipe just the bulk dataset and re-seed
just ace 'make:controller orders'       # scaffold a controller
just ace 'make:model Order -m'          # model + migration in one go
just ace 'make:validator order'         # VineJS schema
just ace 'make:transformer order'       # BaseTransformer<Order> stub

# Verification
pnpm --filter @calibra/api typecheck    # tsc --noEmit
pnpm --filter @calibra/api test         # full Japa suite (unit + functional)
just lint                               # biome + sherif

# Spec / route drift detection
just docs-check                         # bundle OpenAPI specs + node ace check:api-docs
node ace check:api-docs                 # diff registered routes against the bundled spec
node ace check:api-docs --update-known-drift  # rewrite .check-api-docs-known-drift.json
```

## API spec drift

Two complementary mechanisms keep the hand-authored OpenAPI documentation honest with the code:

- **Runtime contract assertions.** `tests/bootstrap.ts` wires `@japa/openapi-assertions` against `docs/api/dist/_merged.test.json`. Functional tests call `response.assertAgainstApiSpec()` after every successful (2xx) status assertion; schema drift turns a test red. The `pretest` npm script regenerates the merged spec before every `node ace test` run, so the assertions always validate against the latest source.
- **Route inventory lint.** `node ace check:api-docs` diffs the live router against the bundled spec and exits 1 on new drift (`missing-in-spec` / `stale-in-spec` / `mismatch`). Acknowledged drift from before the lint was wired up lives in `.check-api-docs-known-drift.json`; remove entries when the route or spec catches up, regenerate with `--update-known-drift` after intentional changes.

## Auth (when wiring)

`@adonisjs/auth@10` is installed but not yet wired. When wiring:

1. `node ace configure @adonisjs/auth --guard=access_tokens` — wires the auth provider, generates the `auth_access_tokens` migration, scaffolds `app/middleware/auth_middleware.ts`.
2. Add a `User` model + `users` migration; reference it from `config/auth.ts` as the user provider.
3. Mount login routes (`POST /api/v1/auth/login`, `POST /api/v1/auth/logout`) under `start/routes/auth.ts`. Register the `auth` middleware in `start/kernel.ts` `router.named({ auth: () => import('#middleware/auth_middleware') })`.
4. Mint tokens with `User.accessTokens.create(user, abilities?, { expiresIn })`; ship `tokenResult.value!.release()` to the client.
5. In tests, use `.loginAs(user)` from `@japa/api-client` — it mints a real token and attaches the bearer header through the full pipeline.
