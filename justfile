set dotenv-load := true

mod api-docs "docs/api/mod.just"

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

default: dev

# Install nodejs dependencies
install:
    pnpm install

# Bring up the full dev stack: Postgres (+pgAdmin) in docker, then web + admin + api dev servers
# on the host. Storefront :3000, admin :3001, api :3333, pgAdmin :5050.
# Ctrl-C stops the dev servers; the DB container keeps running (`just down` to stop it).
up: install db-up migrate
    pnpm dev

# Same as `up` but only runs the API dev server (skips web + admin)
up-api: install db-up migrate
    pnpm dev:api

# Same as `up` but only runs the storefront (assumes API is already running elsewhere)
up-web: install
    pnpm dev:web

# Same as `up` but only runs the admin panel (assumes API is already running elsewhere)
up-admin: install
    pnpm dev:admin

# Run dev servers without touching docker (assumes db is already up)
dev: install
    pnpm dev

# Stop the dev infra containers (preserves volumes — data survives)
down: db-down

# Boot Postgres + pgAdmin and block until db is healthy (docker compose --wait)
db-up:
    cd apps/api && docker compose up -d --wait

# Stop the dev infra containers (preserves volumes)
db-down:
    cd apps/api && docker compose down

# Nuke the dev db volumes and start fresh (loses all data)
db-reset:
    cd apps/api && docker compose down -v
    @just db-up
    @just migrate

# Tail the db container logs
db-logs:
    cd apps/api && docker compose logs -f db

# Open a psql shell inside the db container
db-shell:
    cd apps/api && docker compose exec db psql -U $${DB_USER:-calibra} -d $${DB_DATABASE:-calibra}

# Run pending Lucid migrations (db must be up)
migrate:
    pnpm --filter @calibra/api exec node ace migration:run

# Roll back the last migration batch
migrate-rollback:
    pnpm --filter @calibra/api exec node ace migration:rollback

# Run all Lucid seeders
seed:
    pnpm --filter @calibra/api exec node ace db:seed

# Run an arbitrary Lucid/Ace command, e.g. `just ace 'make:controller orders'`
ace arg:
    pnpm --filter @calibra/api exec node ace {{ arg }}

# Build every package + app via turbo
build:
    pnpm build

# Run all unit + integration tests
test *args:
    pnpm test {{ args }}

# Run the storefront Playwright e2e suite
test-e2e *args:
    pnpm --filter @calibra/web run test:e2e {{ args }}

# Record a new storefront spec via Playwright's codegen recorder
test-e2e-codegen *args:
    pnpm --filter @calibra/web run test:e2e:codegen {{ args }}

# Run the e2e suite in headed mode
test-e2e-headed *args:
    pnpm --filter @calibra/web run test:e2e:headed {{ args }}

# Open Playwright's UI mode
test-e2e-ui *args:
    pnpm --filter @calibra/web run test:e2e:ui {{ args }}

# Open the last HTML report
test-e2e-report *args:
    pnpm --filter @calibra/web run test:e2e:report {{ args }}

# Run the admin e2e suite
test-e2e-admin *args:
    pnpm --filter @calibra/admin run test:e2e {{ args }}

# Run typecheck across all packages
typecheck:
    pnpm typecheck

# Run all linters (biome + sherif)
lint:
    pnpm lint

# Apply format:fix across the workspace
format:
    pnpm format:fix

# Ready for PR review: format, lint, typecheck, build, test
ready: format lint typecheck build test

# Build the OpenAPI docs bundle into docs/api/dist/ and serve it on :5055
docs-dev:
    @just api-docs::dev

# Bundle both storefront and admin OpenAPI specs into docs/api/dist/
docs-build:
    @just api-docs::build

# Run redocly lint across both storefront and admin specs
docs-lint:
    @just api-docs::lint

# Clean build artifacts and caches
clean:
    find . \( -name 'node_modules' -o -name '.pnpm' -o -name '.turbo' -o -name 'build' -o -name '.next' -o -name '.cache' -o -name 'dist' -o -name 'coverage' -o -name 'playwright-report' -o -name 'test-results' \) \
    	-type d -prune -print -exec rm -rf '{}' \;
    find . -type f -name 'tsconfig.tsbuildinfo' -exec rm -f {} +

# Clean all build artifacts and caches and reinstall dependencies
fresh: clean install db-reset
