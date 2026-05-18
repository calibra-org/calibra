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

# Run the web app only (assumes WordPress is already running)
dev: install
    pnpm dev

# Boot the full stack: WordPress backend (docker) + Next.js storefront (dev server)
up: install cms-up
    pnpm dev

# Stop the WordPress backend (preserves volumes)
down: cms-down

# Build all packages
build:
    pnpm build

# Run all unit + integration tests
test *args:
    pnpm test {{ args }}

# Run the web Playwright e2e suite (set BASE_URL to target a remote preview; otherwise boots `pnpm run dev`)
test-e2e *args:
    pnpm --filter @calibra/web run test:e2e {{ args }}

# Record a new spec via Playwright's codegen recorder
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

# Boot the WordPress backend (docker compose up -d)
cms-up:
    pnpm --filter @calibra/cms run up

# Stop the WordPress backend (preserves volumes)
cms-down:
    pnpm --filter @calibra/cms run down

# Nuke WordPress volumes and start fresh (loses DB + uploads)
cms-reset:
    pnpm --filter @calibra/cms run reset

# Tail WordPress logs
cms-logs:
    pnpm --filter @calibra/cms run logs

# Forward an argument to wp-cli inside the WordPress container, e.g. `just cms-wp 'plugin list'`
cms-wp arg:
    pnpm --filter @calibra/cms run wp {{ arg }}

# Clean build artifacts and caches
clean:
    find . \( -name 'node_modules' -o -name '.pnpm' -o -name '.turbo' -o -name 'build' -o -name '.next' -o -name '.cache' -o -name 'dist' -o -name 'coverage' -o -name 'playwright-report' -o -name 'test-results' \) \
    	-type d -prune -print -exec rm -rf '{}' \;
    find . -type f -name 'tsconfig.tsbuildinfo' -exec rm -f {} +

# Clean all build artifacts and caches and reinstall dependencies
fresh: clean
    pnpm install
