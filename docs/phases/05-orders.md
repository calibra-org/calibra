# Phase 05 — Orders + Checkout

> Order tables + state machine + stock reservation. Checkout draft + submit flow. Order CRUD (admin + account). Order line snapshots + audit log.

**Branch:** `phase/05-orders`
**Prerequisites:** phase-01, phase-02, phase-03, phase-04. Read [`09-extensibility-patterns.md`](./09-extensibility-patterns.md) — patterns 1, 3, 5 apply.
**Parallel with:** phase-06-coupons (both extend cart→order flow but in disjoint files)
**Migration timestamp block:** `1747500000000`–`1747599999999`
**Estimated scope:** ~10 migrations, ~10 models, ~15 endpoints, ~35 tests.

## Goal

After this PR:

- `POST /checkout` converts a cart into a draft order (`status='draft'`).
- `PUT /checkout` persists billing/shipping addresses + payment method choice + customer note onto the draft.
- `POST /checkout/submit` finalizes: validates everything, snapshots line items, reserves stock, transitions to `pending`, returns the placed order + `order_key` for the pay-link.
- Customer can view their own orders; admin can CRUD any order, transition statuses (with audit log), and run the order state machine.
- Stock decrements + restores correctly on transitions (per ADR D10).
- Idempotency-Key header on submit prevents double-submits.

## Files this phase owns

```
apps/api/
├── start/routes/
│   ├── checkout.ts
│   ├── account_orders.ts
│   └── admin_orders.ts
├── database/
│   └── migrations/
│       ├── 1747500000000_create_orders_table.ts
│       ├── 1747500100000_create_order_number_sequence.ts          # raw SQL sequence
│       ├── 1747500200000_create_order_addresses_table.ts
│       ├── 1747500300000_create_order_line_items_table.ts
│       ├── 1747500400000_create_order_line_item_taxes_table.ts
│       ├── 1747500500000_create_order_shipping_lines_table.ts
│       ├── 1747500600000_create_order_fee_lines_table.ts
│       ├── 1747500700000_create_order_coupon_lines_table.ts
│       ├── 1747500800000_create_order_tax_lines_table.ts
│       ├── 1747500900000_create_order_status_history_table.ts
│       ├── 1747501000000_create_order_document_type_enum.ts             # Pattern 5 — empty enum, values added as features land
│       └── 1747501100000_create_order_documents_table.ts                # Pattern 5
├── app/
│   ├── models/
│   │   ├── order.ts
│   │   ├── order_address.ts
│   │   ├── order_line_item.ts
│   │   ├── order_line_item_tax.ts
│   │   ├── order_shipping_line.ts
│   │   ├── order_fee_line.ts
│   │   ├── order_coupon_line.ts
│   │   ├── order_tax_line.ts
│   │   ├── order_status_history.ts
│   │   └── order_document.ts                      # Pattern 5 — minimal model; renderer comes with a future feature
│   ├── controllers/
│   │   ├── checkout/
│   │   │   ├── draft_controller.ts                # GET/PUT /checkout
│   │   │   ├── submit_controller.ts               # POST /checkout/submit
│   │   │   └── pay_link_controller.ts             # POST /checkout/orders/:order_key/pay
│   │   ├── account/
│   │   │   └── orders_controller.ts
│   │   └── admin/
│   │       └── orders_controller.ts
│   ├── enums/
│   │   └── order_status.ts                        # exported enum + transition map
│   ├── validators/
│   │   ├── checkout/
│   │   │   ├── draft_validator.ts
│   │   │   └── submit_validator.ts
│   │   └── orders/
│   │       └── status_validator.ts
│   ├── services/
│   │   ├── order_factory.ts                       # cart → draft order conversion
│   │   ├── order_finalizer.ts                     # draft → pending + stock reserve
│   │   ├── order_state_machine.ts                 # transition guard + side-effects
│   │   └── order_number_service.ts                # allocate from sequence
│   └── middleware/
│       └── idempotency_middleware.ts              # `Idempotency-Key` header dedupe
└── tests/
    ├── unit/orders/
    │   ├── order_state_machine.spec.ts
    │   ├── order_factory.spec.ts
    │   ├── order_finalizer.spec.ts
    │   └── order_number.spec.ts
    └── functional/orders/
        ├── checkout_draft.spec.ts
        ├── checkout_submit.spec.ts
        ├── checkout_idempotency.spec.ts
        ├── pay_link.spec.ts
        ├── account_orders.spec.ts
        ├── admin_orders_crud.spec.ts
        ├── order_status_transitions.spec.ts
        └── stock_reservation.spec.ts
```

## Schema (ADR §"Orders" and "Refunds")

`orders`:
- `id BIGSERIAL PK`
- `order_number BIGINT UNIQUE NOT NULL DEFAULT nextval('order_number_seq')` — independent sequence (`CREATE SEQUENCE order_number_seq START 1000`).
- `order_key CHAR(32) UNIQUE` — opaque guest-pay-link token (32 bytes base32).
- `status order_status_enum NOT NULL`
- `customer_id` FK NULLABLE
- `billing_email`
- `currency CHAR(3)` (locked)
- `currency_display CHAR(3)` (locked)
- `payment_gateway_id_snapshot` FK NULLABLE + `payment_method_code_snapshot, payment_method_title_snapshot`
- `transaction_id NULLABLE` (set on capture, phase 08)
- `customer_note TEXT NULLABLE`
- Totals (all BIGINT): `items_total, items_tax_total, shipping_total, shipping_tax_total, fees_total, fees_tax_total, discount_total, discount_tax_total, tax_total, grand_total`
- `prices_include_tax BOOL`
- `created_via VARCHAR(20) NOT NULL` (`checkout, admin, api, import`)
- `ip_address INET NULLABLE`
- `user_agent TEXT NULLABLE`
- `idempotency_key VARCHAR(64) UNIQUE NULLABLE`
- `cart_hash VARCHAR(64) NULLABLE`
- `date_paid_at TIMESTAMPTZ NULLABLE`
- `date_completed_at TIMESTAMPTZ NULLABLE`
- `attributes JSONB DEFAULT '{}'`
- `deleted_at TIMESTAMPTZ NULLABLE`

Indexes: `status`, `customer_id`, `created_at DESC`, `idempotency_key`, partial `WHERE deleted_at IS NULL`.

`order_addresses`: snapshot, UNIQUE `(order_id, kind)` — `kind ∈ ('billing','shipping')`. Carries the same address columns as `customer_addresses` (including `region_id` per Pattern 1, plus `region_text` fallback). Iran-specific identifiers snapshot into the `order_address_iran_extensions` table (Pattern 3, created in phase 03); the snapshotter checks `customer_iran_profiles` + `customer_addresses.attributes.iran.*` and writes the extension row only when source data exists.

`order_line_items`: see ADR. Snapshots `name, sku, price` at sale time. FKs to `product`/`variation` are `ON DELETE SET NULL` so historical orders survive product deletion.

`order_line_item_taxes`: `(line_item_id, tax_rate_id, tax_amount, shipping_tax_amount)`.

`order_shipping_lines`, `order_fee_lines`, `order_coupon_lines`, `order_tax_lines`: per ADR §"Orders".

`order_status_history`: append-only audit log. `id, order_id, from_status, to_status, changed_by_user_id NULLABLE, reason TEXT NULLABLE, occurred_at`.

`order_documents` (Pattern 5):
- `id BIGSERIAL PK`
- `order_id` FK NOT NULL ON DELETE RESTRICT
- `type order_document_type_enum NOT NULL` — empty enum at MVP (`CREATE TYPE order_document_type_enum AS ENUM ();`); values added via subsequent migrations as features land (`proforma`, `invoice`, `packing_slip`, `credit_note`, `delivery_note`, …)
- `number BIGINT NULL` — per-type sequence, allocated on `issued` transition
- `locale VARCHAR(8) NOT NULL`
- `currency CHAR(3) NOT NULL`, `currency_display CHAR(3) NOT NULL`, `amount_minor BIGINT NOT NULL`
- `status VARCHAR(20) NOT NULL` — `draft | issued | voided`
- `issued_at TIMESTAMPTZ NULL`, `issued_by_user_id` FK NULL
- `pdf_media_id` FK media NULL
- `attributes JSONB DEFAULT '{}'`, `created_at`, `updated_at`
- UNIQUE INDEX `(type, number) WHERE number IS NOT NULL`

No controllers, no endpoints in this phase — just the table + model + enum so the proforma/invoice/etc. features that ship later are pure additions (new enum value + new renderer + new endpoints), not a hot-table migration.

## Order status enum + state machine

`app/enums/order_status.ts`:

```ts
export enum OrderStatus {
  Draft = 'draft',
  Pending = 'pending',
  OnHold = 'on_hold',
  Processing = 'processing',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Refunded = 'refunded',
  Failed = 'failed',
}
```

Transitions table (matches ADR §"Order state machine"):

| from | to | trigger | side effects |
|---|---|---|---|
| `draft` | `pending` | `POST /checkout/submit` | Reserve stock, allocate `order_number`, emit `OrderPlaced`. |
| `draft` | `cancelled` | Idle timeout (`orders.draft_expiry_hours`) | None. |
| `pending` | `on_hold` | Manual gateway, or async-pending payment | Emit `OrderOnHold` (email queue stub). |
| `pending` | `processing` | Payment success (phase 08 fires this) | Set `date_paid_at`. Emit `OrderProcessing`. |
| `pending` | `failed` | Payment failure | None. |
| `pending` | `cancelled` | Customer/admin OR `inventory.hold_stock_minutes` timer | Restore stock. |
| `on_hold` | `processing` | Admin marks paid OR async gateway confirms | Set `date_paid_at`. |
| `on_hold` | `cancelled` | Admin/customer | Restore stock. |
| `on_hold` | `failed` | Async gateway negative | None. |
| `processing` | `completed` | Admin "mark shipped" OR auto for virtual/downloadable | Set `date_completed_at`. Grant `customer_downloads` for downloadable lines (phase 03 stub). |
| `processing` | `cancelled` | Admin | Restore stock. |
| `processing` | `refunded` | Full refund (phase 07) | — |
| `completed` | `refunded` | Full refund (phase 07) | — |
| `failed` | `pending` | Customer retries via pay-link | Re-reserve stock if released. |

`order_state_machine.ts` exposes:

```ts
class OrderStateMachine {
  canTransition(from, to): boolean
  async transition(order, to, opts: { actor, reason }): Promise<void>   // throws if illegal
  // internally writes audit row + triggers side effects
}
```

Every transition writes to `order_status_history` and runs the named side-effect (stock change, downloads grant, etc.). All inside a DB transaction.

## Endpoints

### Storefront checkout (`start/routes/checkout.ts`, prefix `/api/v1/checkout`, `cart_middleware`)

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/` | — | Returns the current draft order (creating one from the current cart if absent). |
| `PUT` | `/` | `{billing_address, shipping_address?, payment_gateway_id?, customer_note?}` | Persists to the draft. Shipping defaults to billing if unset. Recomputes totals. |
| `POST` | `/submit` | (none; `Idempotency-Key` header recommended) | Finalizes. See "Submit flow" below. |
| `POST` | `/orders/:order_key/pay` | `{payment_gateway_id}` | For failed/on-hold orders, lets a guest retry payment via the `order_key`. Re-reserves stock if needed. |

### Account orders (`start/routes/account_orders.ts`, prefix `/api/v1/account/orders`, `auth`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | List orders for `auth.user.customer_id`. |
| `GET` | `/:id` | Single order (cross-tenant → 404). |

### Admin orders (`start/routes/admin_orders.ts`, prefix `/api/v1/admin/orders`, `auth + admin`)

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/` | — | List + filter (`status`, `customer_id`, `created_via`, `search`, `after`, `before`). |
| `GET` | `/:id` | — | Single with line items + addresses + status history. |
| `POST` | `/` | order shape | Admin manual order create. |
| `PATCH` | `/:id` | partial | Update header fields. Status transitions go through the dedicated endpoint. |
| `DELETE` | `/:id` | — | Soft-delete (`deleted_at`). |
| `POST` | `/:id/status` | `{to_status, reason?}` | Run a state-machine transition. Returns updated order. |
| `POST` | `/batch` | `{create, update, delete}` | |

## Submit flow (most important code path)

`POST /checkout/submit` calls `order_finalizer.finalize(draftOrder, ctx)`:

1. **Idempotency check** (middleware): if `Idempotency-Key` header matches an existing `orders.idempotency_key`, return that order's response immediately.
2. **Validate** the draft has billing_address, payment_gateway_id, ≥1 line item, totals are non-zero.
3. **Begin transaction**.
4. **Lock inventory rows** for all line items (`SELECT … FOR UPDATE` on `inventory_items`).
5. **Re-validate stock**: every line's quantity ≤ available; else 422 (`{ code: 'out_of_stock', line_id, available }`).
6. **Snapshot prices**: re-read current `regular_price`/`sale_price` to detect drift; if drift > threshold (settings-driven), 409 (`{ code: 'price_changed', line_id, old, new }`).
7. **Allocate** `order_number` from sequence.
8. **Reserve stock**: append `inventory_movements` rows with `kind='reservation'`, decrement `inventory_items.stock_quantity`.
9. **Transition** status `draft → pending` via state machine.
10. **Commit**.
11. **Clear cart** (delete the cart row; client should drop the cookie).
12. **Return** `{ order, payment: { gateway, redirect_url? } }`. `redirect_url` is null in this phase; phase 08 fills it from `payment_attempts`.

If anything throws, the transaction rolls back; idempotency key is NOT written.

## `order_factory.ts` (cart → draft conversion)

- Reads cart + items + applied_coupons + selected shipping rate.
- Reads addresses (from customer's default or from cart's transient address).
- Writes one `orders` row with `status='draft'`, copies line items as snapshots, copies shipping line, copies coupon lines (with snapshotted code), copies tax lines.
- Returns the new order (no stock reservation yet — that's `finalize`).

## `order_number_service.ts`

- Reads next value from `order_number_seq` (Postgres sequence).
- Returns `BIGINT`. No formatting in MVP — `settings.orders.number_format` is currently `"{id}"` (passthrough). Template renderer is added later.

## Validators

- `draft_validator`: address shape (per phase 03), payment_gateway_id is enabled + supports the cart's totals.
- `submit_validator`: nothing in body; middleware validates header.
- `admin status_validator`: `to_status ∈ enum`, transition is legal (cross-validation in controller).

## Tests

### Unit

| Spec | Cases |
|---|---|
| `order_state_machine.spec.ts` | Every legal transition + every illegal one (assert throws with localized message). |
| `order_factory.spec.ts` | (a) Empty cart → throws. (b) Multi-line cart produces correct line snapshots. (c) Selected shipping rate copied as `order_shipping_lines` row. (d) Coupons (phase-06-stub) accepted. |
| `order_finalizer.spec.ts` | (a) Happy path produces `pending` order + inventory_movement rows. (b) Out-of-stock mid-finalize → rollback + 422. (c) Price drift > threshold → rollback + 409. (d) Idempotency: same `Idempotency-Key` returns same order; second insert is a no-op. |
| `order_number.spec.ts` | (a) Two allocations are sequential. (b) Concurrent allocations don't collide (sequence is atomic). |

### Functional

| Spec | Cases |
|---|---|
| `checkout_draft.spec.ts` | (a) GET creates draft from cart. (b) GET twice returns same draft. (c) PUT persists billing/shipping/payment. (d) PUT recomputes totals when address changes (tax recalc). |
| `checkout_submit.spec.ts` | (a) Happy path: draft → pending, stock reserved, order_number allocated. (b) Without billing → 422. (c) Without payment gateway → 422. (d) Empty cart → 422. (e) Cart cleared after submit. |
| `checkout_idempotency.spec.ts` | (a) Same key replays same response. (b) Different keys produce different orders. (c) Replay works after the original order's status has advanced (returns *current* state, not stale). |
| `pay_link.spec.ts` | (a) Valid `order_key` + failed order → re-reserves stock + returns payment intent (stub). (b) Wrong key → 404. (c) Completed order → 409. |
| `account_orders.spec.ts` | (a) List shows own orders. (b) Cross-tenant 404. (c) Includes line items + addresses + status history. |
| `admin_orders_crud.spec.ts` | (a) Admin list paginated. (b) Filter by status. (c) Admin can create order manually (`created_via='admin'`). (d) Soft-delete. |
| `order_status_transitions.spec.ts` | One test per legal transition; illegal returns 422 with localized message; audit row written. |
| `stock_reservation.spec.ts` | (a) Submit reserves. (b) Cancel restores. (c) Hold-stock timeout cancels pending orders + restores stock. (d) Refund restores per requested-line quantities (phase-07 contract). |

## Definition of done

- [ ] All migrations apply; sequence is created.
- [ ] State machine covers all transitions from ADR; every test in the matrix passes.
- [ ] Idempotency middleware exists and is mounted on the submit route.
- [ ] Stock reservation works under concurrency (test simulates two carts buying the last unit).
- [ ] PR body shows: full curl walkthrough — login, add to cart, set address, select rate, draft, submit, retrieve order.
- [ ] `start/routes.ts` uncomments checkout, account_orders, admin_orders.
