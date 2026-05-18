# Phase 06 — Coupons

> Coupons + redemption ledger (race-safe usage limits). Cart-apply / cart-remove endpoints. Admin coupon CRUD. Discount math integrated into cart totals via the `Discounter` interface from phase 04.

**Branch:** `phase/06-coupons`
**Prerequisites:** phase-01, phase-02, phase-03, phase-04 (extends `cart_totals_service`)
**Parallel with:** phase-05-orders (touches cart_applied_coupons table established in phase 04 and adds the discount stage; phase 05 reads coupon lines from the cart at order create)
**Migration timestamp block:** `1747600000000`–`1747699999999`
**Estimated scope:** ~5 migrations, ~5 models, ~7 endpoints, ~25 tests.

## Goal

After this PR:

- Coupons exist as a typed entity with all WC constraint fields.
- Storefront can apply / remove coupons on a cart; totals recompute correctly.
- Admin can CRUD coupons + see redemption history.
- Usage limits (`usage_limit_global`, `usage_limit_per_user`) are enforced via a redemption ledger with proper concurrency control — NOT a single counter.
- `order_factory.ts` (from phase 05) copies `cart_applied_coupons` into `order_coupon_lines` at draft creation.
- `order_finalizer.ts` writes one `coupon_redemptions` row per applied coupon inside the submit transaction.

## Files this phase owns

```
apps/api/
├── start/routes/
│   ├── admin_coupons.ts                           # admin CRUD
│   └── (extends cart.ts via additional handlers)  # POST /cart/coupons, DELETE /cart/coupons/:code
├── database/
│   ├── migrations/
│   │   ├── 1747600000000_create_coupons_table.ts
│   │   ├── 1747600100000_create_coupon_translations_table.ts
│   │   ├── 1747600200000_create_coupon_product_constraints_table.ts
│   │   ├── 1747600300000_create_coupon_category_constraints_table.ts
│   │   ├── 1747600400000_create_coupon_email_restrictions_table.ts
│   │   └── 1747600500000_create_coupon_redemptions_table.ts
│   └── seeders/
│       └── 0006_coupons_demo_seeder.ts            # 5 demo coupons (one of each type)
├── app/
│   ├── models/
│   │   ├── coupon.ts
│   │   ├── coupon_translation.ts
│   │   ├── coupon_product_constraint.ts
│   │   ├── coupon_category_constraint.ts
│   │   ├── coupon_email_restriction.ts
│   │   └── coupon_redemption.ts
│   ├── controllers/
│   │   ├── cart/
│   │   │   └── coupons_controller.ts              # apply / remove
│   │   └── admin/
│   │       └── coupons_controller.ts
│   ├── validators/
│   │   └── coupons/
│   │       ├── coupon_validator.ts                # admin create/update
│   │       └── apply_validator.ts                 # cart apply
│   └── services/
│       └── discounter_service.ts                  # implements the Discounter interface from phase 04
└── tests/
    ├── unit/coupons/
    │   ├── discounter.spec.ts                     # math + ordering
    │   ├── coupon_eligibility.spec.ts             # all constraint checks
    │   └── redemption_concurrency.spec.ts         # race conditions
    └── functional/coupons/
        ├── cart_apply.spec.ts
        ├── cart_remove.spec.ts
        ├── admin_coupons_crud.spec.ts
        ├── usage_limit_global.spec.ts
        └── usage_limit_per_user.spec.ts
```

## Schema (ADR §"Coupons")

`coupons`:
- `id BIGSERIAL PK`
- `code CITEXT UNIQUE NOT NULL`
- `discount_type` enum `percent | fixed_cart | fixed_product | free_shipping`
- `amount_minor BIGINT NULLABLE` — for fixed types (Rial minor units)
- `amount_percent NUMERIC(5,2) NULLABLE` — for percent type
- `CHECK ((discount_type='percent' AND amount_percent IS NOT NULL AND amount_minor IS NULL) OR (discount_type IN ('fixed_cart','fixed_product') AND amount_minor IS NOT NULL AND amount_percent IS NULL) OR (discount_type='free_shipping'))`
- `starts_at TIMESTAMPTZ NULLABLE`
- `expires_at TIMESTAMPTZ NULLABLE`
- `individual_use BOOL DEFAULT false`
- `exclude_sale_items BOOL DEFAULT false`
- `minimum_amount BIGINT NULLABLE` — cart subtotal floor
- `maximum_amount BIGINT NULLABLE` — cart subtotal ceiling
- `usage_limit_global INT NULLABLE` — null = unlimited
- `usage_limit_per_user INT NULLABLE`
- `limit_usage_to_x_items INT NULLABLE` — for `fixed_product` / `percent`, cap how many units the discount applies to
- `free_shipping BOOL DEFAULT false` — orthogonal to `discount_type='free_shipping'` (a percent coupon can also grant free shipping)
- `status` enum `active | disabled`
- `attributes JSONB DEFAULT '{}'`
- `deleted_at TIMESTAMPTZ NULLABLE`

`coupon_translations`: `(coupon_id, locale, description)`.

`coupon_product_constraints`: `(coupon_id, product_id, mode enum include|exclude)`.

`coupon_category_constraints`: `(coupon_id, category_id, mode enum include|exclude)`.

`coupon_email_restrictions`: `(coupon_id, email_pattern)` — pattern may be exact (`user@example.com`) or domain (`*@example.com`).

`coupon_redemptions` — append-only ledger:
- `id BIGSERIAL PK`
- `coupon_id` FK ON DELETE RESTRICT
- `order_id` FK ON DELETE RESTRICT
- `customer_id` FK NULLABLE (null for guests; matched-by `email_snapshot` for per-user limit fallback)
- `email_snapshot VARCHAR(320) NOT NULL`
- `redeemed_at TIMESTAMPTZ DEFAULT now()`
- UNIQUE `(coupon_id, order_id)` — one redemption per coupon per order.

Index on `(coupon_id, customer_id)` for per-user counts; index on `(coupon_id, email_snapshot)` for guest per-user counts.

## Endpoints

### Cart coupon apply / remove (extends `start/routes/cart.ts`)

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/cart/coupons` | `{code}` | Validates coupon (status, dates, constraints, limits), adds to `cart_applied_coupons`, recomputes totals. 422 with `{code, reason}` if invalid. |
| `DELETE` | `/cart/coupons/:code` | — | Removes. |

### Admin (`start/routes/admin_coupons.ts`, prefix `/api/v1/admin/coupons`)

Standard CRUD + `POST /batch` + `GET /:id/redemptions` (paginated history).

## Discount math (`discounter_service.ts`)

Implements the `Discounter` interface from phase 04. Math order matches WC modern (ADR §"Shipping/tax/coupon math"):

1. Sort applied coupons by type: `fixed_product` → `percent` → `fixed_cart`.
2. For each coupon in order:
   - Compute eligibility (constraints + min/max amount + dates + per-user/global limits).
   - For `fixed_product`: discount = `amount_minor * eligible_qty` (capped by line total).
   - For `percent`: discount = `round(line_subtotal_remaining * amount_percent / 100)`.
   - For `fixed_cart`: distribute the amount across remaining eligible lines pro-rata by remaining subtotal.
   - For `free_shipping`: mark the cart's selected shipping rate as zero-cost (handled at the totals stage, not as a line discount).
3. Track per-line + total discount; tax is recomputed on post-discount line totals (per WC modern).
4. `individual_use=true` coupon at any position means *only* that coupon may apply (UI should prevent stacking; backend enforces).

Returns `{ per_line: Map<line_id, discount>, per_coupon: Map<code, {discount, discount_tax}>, free_shipping: boolean }`.

## Redemption ledger writes (phase-05 integration)

`order_finalizer.ts` (from phase 05) extends its transaction body:

After stock reservation, for each `cart_applied_coupons` row:

1. `SELECT * FROM coupons WHERE id = ? FOR UPDATE` — lock the row.
2. Re-validate (limits may have been hit by another concurrent submit).
3. `INSERT INTO coupon_redemptions (coupon_id, order_id, customer_id, email_snapshot)` — UNIQUE constraint protects against double-write on idempotency replay.
4. Write the `order_coupon_lines` snapshot row.

If validation fails at step 2, the whole transaction rolls back → 409 with `{code: 'coupon_limit_exhausted', code: coupon_code}`. Client should retry without the coupon.

## Eligibility checks (used by both cart apply + finalize)

`discounter_service.checkEligibility(coupon, cart, customer): { ok: true } | { ok: false, reason, hint? }`:

- `coupon.status === 'active'` else `disabled`
- `now >= starts_at` else `not_yet_active`
- `now <= expires_at` else `expired`
- `cart.items_subtotal >= minimum_amount` else `below_minimum`
- `cart.items_subtotal <= maximum_amount` else `above_maximum`
- `cart.items` must include ≥1 line whose product/category satisfies include/exclude constraints
- `coupon.exclude_sale_items` set → cart must have ≥1 non-sale line
- `coupon.individual_use` set AND cart already has other coupons → `individual_use_conflict`
- Email restrictions: `customer.email` matches at least one pattern (if any)
- `usage_limit_global` not exceeded (count `coupon_redemptions WHERE coupon_id = ?`)
- `usage_limit_per_user` not exceeded (count `WHERE coupon_id = ? AND (customer_id = ? OR email_snapshot = ?)`)

All checks return a stable `reason` code; the controller looks up the localized message via `i18n.t(`errors.coupons.${reason}`)`.

## Validators

`coupon_validator` (admin create/update):
- `code` 4–64 chars, kebab/numeric/letter mix, uppercase normalized on save.
- `discount_type` ∈ enum.
- `amount_minor` ≥ 0 when applicable; `amount_percent` ∈ (0, 100] when applicable.
- `starts_at < expires_at` when both set.
- `usage_limit_*` ≥ 1 if present.

`apply_validator`:
- `code` 4–64 chars.

## Seeder

`0006_coupons_demo_seeder.ts` — 5 demo coupons:
- `WELCOME10` — 10% off, expires in 30 days, `usage_limit_per_user=1`.
- `FLAT500K` — fixed_cart 5,000,000 IRR (500k Toman) off, min subtotal 30,000,000 IRR.
- `SHIPFREE` — free_shipping, `individual_use=true`.
- `SUMMER25` — 25% off category=پوشاک, `exclude_sale_items=true`.
- `VIPCASH` — fixed_cart 10,000,000 IRR, `usage_limit_global=10`, `email_restrictions=['vip@*']`.

Idempotent via `updateOrCreate(code)`.

## Tests

### Unit

| Spec | Cases |
|---|---|
| `discounter.spec.ts` | (a) percent: 10% of 1,000,000 = 100,000. (b) fixed_cart distributes pro-rata across 3 lines. (c) fixed_product capped at line total. (d) Sort order `fixed_product → percent → fixed_cart`. (e) `individual_use` rejects stacking. (f) Tax recomputed on post-discount totals. |
| `coupon_eligibility.spec.ts` | One case per failure reason: `disabled, not_yet_active, expired, below_minimum, above_maximum, no_eligible_items, only_sale_items, individual_use_conflict, email_not_allowed, usage_limit_global_reached, usage_limit_per_user_reached`. |
| `redemption_concurrency.spec.ts` | (a) Two concurrent `coupon_redemptions` inserts for the same `(coupon_id, order_id)` → one wins, other fails on UNIQUE. (b) Coupon at last available slot: two carts submit → only one succeeds (the second gets `coupon_limit_exhausted`). |

### Functional

| Spec | Cases |
|---|---|
| `cart_apply.spec.ts` | (a) Apply valid coupon → totals reduced. (b) Unknown code → 404. (c) Disabled coupon → 422 with reason. (d) Expired → 422. (e) Below min → 422. (f) Two apply calls for same code idempotent. |
| `cart_remove.spec.ts` | (a) Remove existing coupon. (b) Remove non-applied → 404. |
| `admin_coupons_crud.spec.ts` | (a) Create. (b) Update changes discount, future-applies (not retroactive). (c) Soft-delete blocks new redemptions; existing redemptions preserved. (d) Batch endpoint. (e) Redemptions list shows applied orders. |
| `usage_limit_global.spec.ts` | Submit N+1 orders with same coupon → last one fails at submit with `coupon_limit_exhausted`. |
| `usage_limit_per_user.spec.ts` | Two orders by same user → second fails. Same coupon by *different* user OK. Guest with same email → second fails. |

## Definition of done

- [ ] All migrations apply.
- [ ] Demo coupons seeded; idempotent.
- [ ] `discounter_service` implements the `Discounter` interface exported by phase 04 (the import path is `#services/discounter_service`).
- [ ] `order_finalizer` integration tested (submit a cart with coupon → ledger row written; replay returns same order).
- [ ] All listed tests pass.
- [ ] PR body shows curls: apply coupon, see total drop, submit order, verify redemption row.
- [ ] `start/routes.ts` uncomments `admin_coupons.ts`. Cart route file may grow two new lines.
