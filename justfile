set dotenv-load := true

mod api-docs "docs/api/mod.just"

# --- one-letter aliases for the recipes typed most often ---------------------
alias r := ready
alias b := build
alias i := install
alias t := test
alias te := test-e2e
alias tec := test-e2e-codegen
alias teh := test-e2e-headed
alias teu := test-e2e-ui
alias ter := test-e2e-report
alias tc := typecheck
alias l := lint
alias fmt := format
alias d := dev
alias u := up
alias s := spin
alias sd := spin-down

default: dev

# === dependencies + workspace bootstrap ======================================

# Install workspace dependencies via pnpm (catalogs honoured; npm is hook-blocked).
install:
    pnpm install

# Copy .env.example → runtime .env files where missing + warn about drift.
env-sync:
    @node scripts/env-sync.mjs

# Nuke build artefacts, caches, and node_modules across the workspace + worktrees.
clean:
    find . \( -name 'node_modules' -o -name '.pnpm' -o -name '.turbo' -o -name 'build' -o -name '.next' -o -name '.cache' -o -name 'dist' -o -name 'coverage' -o -name 'playwright-report' -o -name 'test-results' \) \
    	-type d -prune -print -exec rm -rf '{}' \;
    find . -type f -name 'tsconfig.tsbuildinfo' -exec rm -f {} +

# Clean + reinstall + reset the dev database. Use after a long break or botched merge.
fresh: clean install env-sync db-reset

# === dev infra (lightweight per-checkout layer) ==============================

# Bring up the per-checkout containers (postgres + pgadmin + mailpit + redis + adminer).
db-up:
    cd apps/api && docker compose up -d --wait

# Stop the per-checkout containers (volumes survive, data persists).
db-down:
    cd apps/api && docker compose down

# Wipe the dev db volume + bring it back fresh + re-migrate ("clean slate" button).
db-reset: env-sync
    cd apps/api && docker compose down -v
    @just db-up
    @just migrate

# Tail the Postgres container logs.
db-logs:
    cd apps/api && docker compose logs -f db

# Open a psql shell inside the Postgres container.
db-shell:
    cd apps/api && docker compose exec db psql -U $${DB_USER:-calibra} -d $${DB_DATABASE:-calibra}

# === spin: prod-parity stack against the current checkout =====================
#
# `just spin` brings up the FULL stack on the current checkout — no worktree, no branch,
# no PR. For worktree-based per-task spins (with PRs), use `pnpm spin <slug>` directly;
# see scripts/spin.md and the spin-task skill.

# Bring up the full prod-parity stack (caddy + observability + meilisearch + …) in-place.
spin *args:
    @pnpm spin local {{ args }}

# Tear down the in-place spin. Pass `--purge` to also drop docker volumes.
spin-down *args:
    @pnpm spin local stop {{ args }}

# Per-service health pills for the in-place spin (up/down + URL).
spin-status:
    @pnpm spin local status

# JSON variant of spin-status — pipe into jq for scripted health checks.
spin-status-json:
    @pnpm spin doctor local --json

# Inventory every persisted spin (worktree-based AND `local`), with status + ports.
spin-list:
    @pnpm spin list

# JSON variant of spin-list — pipe into jq.
spin-list-json:
    @pnpm spin list --json

# Print one URL from the in-place spin to stdout. Default service: dashboard.
spin-url service='dashboard':
    @pnpm spin url local {{ service }}

# Print the absolute log path for the in-place spin. Default stream: api.ndjson.
spin-logs stream='api.ndjson':
    @pnpm spin logs local {{ stream }}

# curl the in-place spin's /metrics endpoint → stdout (pipe into grep / awk).
spin-metrics:
    @pnpm spin metrics local

# Query the in-place spin's Prometheus /api/v1/alerts → stdout (pipe into jq).
spin-alerts:
    @pnpm spin alerts local

# === dev servers (host) ======================================================

# Bring up db + migrations + every dev server. Storefront :3000, admin :3001, api :3333.
up: install env-sync db-up migrate
    pnpm dev

# Like `up` but only the api dev server.
up-api: install env-sync db-up migrate
    pnpm dev:api

# Like `up` but only the storefront (assumes api is already running elsewhere).
up-web: install env-sync
    pnpm dev:web

# Like `up` but only the admin panel (assumes api is already running elsewhere).
up-admin: install env-sync
    pnpm dev:admin

# Run dev servers without touching docker (assumes db is already up).
dev: install env-sync
    pnpm dev

# Stop the dev infra containers (preserves volumes).
down: db-down

# === adonisjs ace ============================================================

# Run pending Lucid migrations (db must be up).
migrate: env-sync
    pnpm --filter @calibra/api exec node ace migration:run

# Roll back the last migration batch.
migrate-rollback: env-sync
    pnpm --filter @calibra/api exec node ace migration:rollback

# Run every Lucid seeder (the small dev dataset).
seed: env-sync
    pnpm --filter @calibra/api exec node ace db:seed

# Seed the bulk dataset (~100k products / 500k users / ~100k orders). Idempotent.
bulk-seed: env-sync
    pnpm --filter @calibra/api exec node ace db:bulk-seed

# Clear the whole Bentocache. For targeted: `just ace 'cache:clear --tags=catalog:products'`.
cache-clear: env-sync
    pnpm --filter @calibra/api exec node ace cache:clear

# Run an arbitrary Ace command — e.g. `just ace 'make:controller orders'`.
ace arg: env-sync
    pnpm --filter @calibra/api exec node ace {{ arg }}

# === build / test / quality ==================================================

# Build every package + app via turbo.
build:
    pnpm build

# Run the full unit + functional Japa suite (api) and Vitest suites (everywhere else).
test *args:
    pnpm test {{ args }}

# Run the storefront Playwright e2e suite.
test-e2e *args:
    pnpm --filter @calibra/web run test:e2e {{ args }}

# Record a new storefront spec via Playwright's codegen recorder.
test-e2e-codegen *args:
    pnpm --filter @calibra/web run test:e2e:codegen {{ args }}

# Run the storefront e2e suite in headed mode.
test-e2e-headed *args:
    pnpm --filter @calibra/web run test:e2e:headed {{ args }}

# Open Playwright's UI mode against the storefront suite.
test-e2e-ui *args:
    pnpm --filter @calibra/web run test:e2e:ui {{ args }}

# Open the last storefront e2e HTML report.
test-e2e-report *args:
    pnpm --filter @calibra/web run test:e2e:report {{ args }}

# Run the admin e2e suite.
test-e2e-admin *args:
    pnpm --filter @calibra/admin run test:e2e {{ args }}

# Run tsc --noEmit across every workspace.
typecheck:
    pnpm typecheck

# Run all linters (biome + sherif).
lint:
    pnpm lint

# Apply format:fix across the workspace.
format:
    pnpm format:fix

# Ready-for-PR-review gate: format + lint + typecheck + build + test.
ready: format lint typecheck build test

# === api docs ================================================================

# Build the OpenAPI docs bundle into docs/api/dist/ and serve it on :5055.
docs-dev:
    @just api-docs::dev

# Bundle both storefront and admin OpenAPI specs into docs/api/dist/.
docs-build:
    @just api-docs::build

# Run redocly lint across both storefront and admin specs.
docs-lint:
    @just api-docs::lint

# Diff the live Adonis router against the bundled OpenAPI specs (fails on new drift).
docs-check:
    pnpm --filter @calibra/api-docs run build:json
    TRANSMIT_TRANSPORT=none QUEUE_DRIVER=sync LIMITER_STORE=memory CACHE_DRIVER=memory pnpm --filter @calibra/api exec node ace check:api-docs
