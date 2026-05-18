# Backend implementation phases

Source of truth: [`docs/adr/0001-commerce-domain-model.md`](../adr/0001-commerce-domain-model.md). The phases below are slices of that ADR sized for parallel execution. Every phase is **backend-only** (`apps/api`); storefront/admin wiring is a separate concern.

Each phase doc declares its prerequisites, the files it owns, and its own dedicated tests. Phases in the same dependency tier can run in parallel in independent worktrees + branches.

## Dependency graph

```
                            phase-01-foundation
                                    │
                ┌───────────────────┴───────────────────┐
                ▼                                       ▼
        phase-02-catalog                    phase-03-customers-auth
                │                                       │
                └───────────────────┬───────────────────┘
                                    ▼
                              phase-04-cart
                                    │
                ┌───────────────────┴───────────────────┐
                ▼                                       ▼
         phase-05-orders                         phase-06-coupons
                │
                ├───────────────────┐
                ▼                   ▼
         phase-07-refunds     phase-08-payments
```

## Read this first

[`09-extensibility-patterns.md`](./09-extensibility-patterns.md) is a cross-cutting polish doc that amends phases 01, 03, 05, and 08 with country-agnostic patterns (regions instead of Iran-only provinces, country-rules service instead of hardcoded address validation, country-scoped profile-extension tables, generic `order_documents` for future invoice/proforma, `payment_links` peer resource). When a phase doc and 09 disagree, 09 wins. Read it before starting any phase.

## Parallel-execution tiers

| Tier | Phases | Notes |
|---|---|---|
| 1 | `01-foundation` | Solo. Establishes the shared route-file split, seeder runner, and lookup tables. Must land first. |
| 2 | `02-catalog`, `03-customers-auth` | Fully parallel — no overlapping files. |
| 3 | `04-cart` | Solo. Depends on catalog + customers. |
| 4 | `05-orders`, `06-coupons` | Parallel. Both extend cart but in disjoint files (orders introduces order tables; coupons introduces coupon tables + cart-apply endpoint). |
| 5 | `07-refunds`, `08-payments` | Parallel. Both depend on orders but touch disjoint files (refunds adds `order_refunds`; payments adds `payment_attempts`). |

## Working in worktrees

For each phase you spin up in parallel, use the `git wt` helper (set up in `~/.gitconfig`):

```sh
# from the repo root, off main:
git worktree add ../calibra--phase-02-catalog -b phase/02-catalog main
git worktree add ../calibra--phase-03-customers-auth -b phase/03-customers-auth main
# … one worktree per parallel agent
```

Each worktree is a full independent checkout. After phases land, `git wda` (alias in `~/.gitconfig`) cleans up the worktrees in bulk.

## Branching + commit convention

- Branch name: `phase/<NN>-<slug>` (e.g. `phase/02-catalog`).
- Commit scope: `api` for everything in these phases (per repo's commit-scope rules).
- Title format: `feat(api): <phase-NN>: <subject>` is fine for atomic phase work; otherwise normal `feat(api):` / `test(api):` / `chore(api):` is preferred for landing intermediate work.
- PR title: `feat(api): phase NN — <name>`. Body links to this phase doc + ADR.

## Files every phase owns

Each phase introduces files under specific path prefixes; this is how we keep parallel branches from colliding.

| Phase | Migrations | Models | Validators | Controllers | Routes file | Seeders |
|---|---|---|---|---|---|---|
| 01 | `1747100000000_*` | `media`, `province`, `tax_class`, `tax_rate`, `shipping_zone`, `shipping_zone_location`, `shipping_method`, `shipping_zone_method`, `payment_gateway`, `setting` | n/a (read-only in tier 1) | n/a | n/a | `0001_foundation_seeder.ts` |
| 02 | `1747200000000_*` | catalog domain | `catalog/*_validator` | `catalog/*` + `admin/catalog/*` | `start/routes/catalog.ts`, `start/routes/admin_catalog.ts` | `0002_catalog_demo_seeder.ts` |
| 03 | `1747300000000_*` | `user`, `customer`, `customer_address`, `customer_download` | `auth/*`, `customer/*` | `auth/*`, `account/*`, `admin/customers_controller` | `start/routes/auth.ts`, `start/routes/account.ts`, `start/routes/admin_customers.ts` | `0003_customers_demo_seeder.ts` |
| 04 | `1747400000000_*` | `cart`, `cart_item`, `cart_applied_coupon` | `cart/*` | `cart_controller` | `start/routes/cart.ts` | n/a |
| 05 | `1747500000000_*` | `order` + 9 line tables | `order/*`, `checkout/*` | `checkout_controller`, `account/orders_controller`, `admin/orders_controller` | `start/routes/checkout.ts`, `start/routes/account_orders.ts`, `start/routes/admin_orders.ts` | n/a |
| 06 | `1747600000000_*` | `coupon` + 4 link tables | `coupon/*` | `admin/coupons_controller` + cart-apply endpoint | `start/routes/admin_coupons.ts` (+ extends `start/routes/cart.ts`) | `0006_coupons_seeder.ts` (demo coupons) |
| 07 | `1747700000000_*` | `order_refund`, `order_refund_line_item`, `order_note`, `order_status_history` | `refund/*`, `note/*` | `admin/order_refunds_controller`, `admin/order_notes_controller`, `admin/order_status_controller` | `start/routes/admin_refunds.ts`, `start/routes/admin_notes.ts` | n/a |
| 08 | `1747800000000_*` | `payment_attempt` + gateway adapters | `payment/*` | `payment_controller` (storefront callbacks), `admin/payment_settings_controller` | `start/routes/payment.ts`, `start/routes/admin_payments.ts` | n/a |

**Migration timestamps** are pre-allocated in distinct hundred-million-second blocks per phase so timestamps don't collide regardless of merge order; pick your specific migrations within your block.

**Routes**: phase 01 establishes one-file-per-domain under `start/routes/*.ts` and imports them from `start/routes.ts`. Subsequent phases only ADD new files plus one new import line — minimal merge-conflict surface.

## Tests are non-optional

Every phase doc includes a **Tests** section listing the exact cases to write. Use Japa per the conventions in `apps/api/AGENTS.md`:

- Functional/HTTP tests via `@japa/api-client` under `tests/functional/<domain>/`.
- Unit tests for pure logic (totals, slug, tax pipeline, coupon validation) under `tests/unit/<domain>/`.
- Database state is per-test (truncate + seed strategy already in `tests/bootstrap.ts`).
- Aim for: every endpoint touches one functional happy-path test + one auth/permission test + one validation-failure test. Every state-machine transition gets a unit test.

`just test` runs the full suite. CI blocks merge on red tests.

## Definition of done (every phase)

A phase PR may only merge when:

1. All migrations apply cleanly from a fresh DB (`just db-reset && just migrate`).
2. All seeders re-run idempotently (`just seed` twice in a row, no error).
3. `pnpm --filter @calibra/api typecheck` passes.
4. `pnpm --filter @calibra/api test` passes.
5. `just lint` passes.
6. The phase doc's "Tests" section is fully covered (one test per listed case).
7. The endpoints listed under the phase's "Routes" are reachable + documented (one cURL example per endpoint in the PR body is sufficient).
8. No new dependencies added without explicit approval (see `apps/api/AGENTS.md` rule on Adonis deps).
