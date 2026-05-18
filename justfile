set dotenv-load := true

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

# Install nodejs dependencies
install:
    pnpm install

# Run the web + admin dev servers (assumes the API is already running)
dev: install
    pnpm dev

# Boot the FULL infra: AdonisJS API + Postgres (docker) + storefront + admin dev servers.
# Storefront at :3000, admin at :3001, API at :3333. Single command — Ctrl-C stops the dev
# servers; the API container keeps running so the next `just up` is fast (`just down` to stop it).
up: install api-up
    pnpm dev

# Stop the API stack (preserves volumes — data survives)
down: api-down

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

# Boot the AdonisJS API + Postgres (docker compose up -d)
api-up:
    pnpm --filter @calibra/api run up

# Stop the API stack (preserves volumes)
api-down:
    pnpm --filter @calibra/api run down

# Nuke the API volumes and start fresh (loses DB)
api-reset:
    pnpm --filter @calibra/api run reset

# Tail the API container logs
api-logs:
    pnpm --filter @calibra/api run logs

# Run a Lucid command inside the API container, e.g. `just api-ace 'migration:run'`
api-ace arg:
    pnpm --filter @calibra/api exec node ace {{ arg }}

# Clean build artifacts and caches
clean:
    find . \( -name 'node_modules' -o -name '.pnpm' -o -name '.turbo' -o -name 'build' -o -name '.next' -o -name '.cache' -o -name 'dist' -o -name 'coverage' -o -name 'playwright-report' -o -name 'test-results' \) \
    	-type d -prune -print -exec rm -rf '{}' \;
    find . -type f -name 'tsconfig.tsbuildinfo' -exec rm -f {} +

# Clean all build artifacts and caches and reinstall dependencies
fresh: clean
    pnpm install
