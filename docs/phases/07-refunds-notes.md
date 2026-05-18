# Phase 07 — Refunds + Notes + Status History

> Order refunds (full + partial, line-item-aware), order notes (internal + customer-visible), admin status transition endpoint, customer order timeline.

**Branch:** `phase/07-refunds`
**Prerequisites:** phase-05-orders
**Parallel with:** phase-08-payments
**Migration timestamp block:** `1747700000000`–`1747799999999`
**Estimated scope:** ~4 migrations, ~4 models, ~10 endpoints, ~25 tests.

## Goal

After this PR:

- Admin can refund a placed order — fully, or partially by specifying line items + quantities + amount.
- Refunds optionally restock inventory.
- Refunds optionally call the payment gateway adapter (phase 08 stub: no-op until that lands).
- Admin and customer can read order notes (visibility-filtered).
- Admin can post notes (internal or customer-visible).
- Order status history endpoint returns the audit timeline (already written in phase 05; this exposes it).

## Files this phase owns

```
apps/api/
├── start/routes/
│   ├── admin_refunds.ts
│   └── admin_notes.ts
├── database/
│   └── migrations/
│       ├── 1747700000000_create_order_refunds_table.ts
│       ├── 1747700100000_create_refund_number_sequence.ts
│       ├── 1747700200000_create_order_refund_line_items_table.ts
│       └── 1747700300000_create_order_notes_table.ts
├── app/
│   ├── models/
│   │   ├── order_refund.ts
│   │   ├── order_refund_line_item.ts
│   │   └── order_note.ts
│   ├── controllers/
│   │   ├── account/
│   │   │   ├── order_notes_controller.ts          # customer-visible notes only
│   │   │   └── order_history_controller.ts        # public status timeline
│   │   └── admin/
│   │       ├── refunds_controller.ts
│   │       ├── order_notes_controller.ts          # internal + customer
│   │       └── order_history_controller.ts        # full history
│   ├── validators/
│   │   ├── refund_validator.ts
│   │   └── note_validator.ts
│   └── services/
│       └── refund_service.ts                      # the actual create-refund logic + side effects
└── tests/
    ├── unit/refunds/
    │   ├── refund_amount_validation.spec.ts
    │   ├── partial_refund.spec.ts
    │   └── full_refund.spec.ts
    └── functional/refunds/
        ├── admin_create_full_refund.spec.ts
        ├── admin_create_partial_refund.spec.ts
        ├── admin_refund_restock.spec.ts
        ├── admin_refund_idempotency.spec.ts
        ├── admin_notes.spec.ts
        ├── customer_notes_visibility.spec.ts
        └── order_history_timeline.spec.ts
```

## Schema (ADR §"Refunds" + "Orders")

`order_refunds`:
- `id BIGSERIAL PK`
- `order_id` FK NOT NULL
- `refund_number BIGINT UNIQUE NOT NULL DEFAULT nextval('refund_number_seq')`
- `amount_minor BIGINT NOT NULL CHECK (amount_minor > 0)`
- `tax_amount_minor BIGINT DEFAULT 0`
- `reason TEXT NULLABLE`
- `refunded_by_user_id` FK NULLABLE
- `restock_requested BOOL DEFAULT false`
- `gateway_refund_id VARCHAR(100) NULLABLE` — populated by phase 08 when refund flows through PSP
- `processed_at TIMESTAMPTZ DEFAULT now()`
- `attributes JSONB DEFAULT '{}'`

`order_refund_line_items`:
- `id BIGSERIAL PK`
- `refund_id` FK NOT NULL
- `order_line_item_id` FK NOT NULL
- `quantity INT NOT NULL CHECK (quantity > 0)`
- `refund_amount_minor BIGINT NOT NULL`
- `refund_tax_minor BIGINT DEFAULT 0`
- UNIQUE `(refund_id, order_line_item_id)` — one refund-line per source-line per refund.

`order_notes`:
- `id BIGSERIAL PK`
- `order_id` FK NOT NULL
- `body TEXT NOT NULL`
- `visibility` enum `internal | customer`
- `author_user_id` FK NULLABLE — null = system-emitted (e.g. status change)
- `attributes JSONB DEFAULT '{}'`
- `created_at`

`order_status_history` — already created in phase 05. This phase only exposes it through endpoints.

## Endpoints

### Admin refunds (`start/routes/admin_refunds.ts`, prefix `/api/v1/admin/orders/:order_id/refunds`)

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/` | — | List refunds for the order. |
| `GET` | `/:id` | — | Single refund. |
| `POST` | `/` | `{amount?, reason?, restock_requested?, line_items?: [{order_line_item_id, quantity}]}` | Create refund. See math + side-effects below. `Idempotency-Key` honored. |
| `DELETE` | `/:id` | — | Soft-delete (refunds typically shouldn't be deleted; consider returning 405 in v1). |

### Admin notes (`start/routes/admin_notes.ts`, prefix `/api/v1/admin/orders/:order_id/notes`)

| Method | Path | Body | Notes |
|---|---|---|---|
| `GET` | `/` | `?type=any\|customer\|internal` (default `any`) | List. |
| `POST` | `/` | `{body, visibility, send_email?}` | Create. `send_email=true` + `visibility=customer` triggers email send (stubbed). |
| `DELETE` | `/:id` | — | Remove. |

### Admin status history (`start/routes/admin_orders.ts` extension — read endpoint)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/v1/admin/orders/:order_id/history` | Full audit log incl. system-emitted rows. |

### Customer-side

- `GET /api/v1/account/orders/:id/notes` — only `visibility='customer'` rows.
- `GET /api/v1/account/orders/:id/history` — public-safe timeline (filter out actor user_id, return localized status labels).

## Refund math + side effects (`refund_service.create`)

```ts
async create(orderId, payload, actor): Promise<OrderRefund>
```

Inside a transaction:

1. **Lock the order** (`SELECT … FOR UPDATE`).
2. **Validate**:
   - Order is not already `refunded`.
   - Either `amount` is given (free refund) OR `line_items[]` is given (per-line refund) — never both.
   - If `line_items[]`: each `quantity` ≤ remaining (compute against existing refund-line totals for the line).
   - If `amount`: `amount + sum(prior refund amounts) ≤ order.grand_total`.
3. **Create** `order_refunds` row. Allocate `refund_number`.
4. **Create** `order_refund_line_items` rows (if line-item refund).
5. **Restock** (if `restock_requested`): for each refunded line, call `inventory_service.increment(product_id, variation_id, quantity, {kind:'return', ref_id: refund_id})`.
6. **Gateway call** (phase 08): if `order.payment_attempts` has a verified attempt AND gateway `.supports.refunds === true`, call adapter's `refund(payment_attempt, amount)`; stash returned PSP id in `gateway_refund_id`. In this phase, stub (`gateway_refund_id` left null; controller body documents the future hook).
7. **Status transition**: if `sum(refunds.amount) >= order.grand_total` → transition order to `refunded`. Else no transition.
8. **Audit note**: write an internal `order_notes` row: `"Refund #{number} for {amount} {currency}. Reason: {reason}"`.
9. **Return** the refund.

Idempotency-Key middleware (from phase 05) deduplicates retries.

## Notes visibility

- `visibility='internal'` notes are NEVER returned in `/account/*` endpoints.
- `visibility='customer'` notes are returned in both `/account/*` and `/admin/*`.
- `send_email=true` (admin POST body) writes the row + queues an email job (stubbed: log to console in dev).

## Validators

- `refund_validator`: amount XOR line_items; positive numbers; quantities ≤ outstanding.
- `note_validator`: body 1–10000 chars; visibility enum.

## Tests

### Unit

| Spec | Cases |
|---|---|
| `refund_amount_validation.spec.ts` | (a) Amount + line_items both → 422. (b) Neither → 422. (c) Amount exceeds outstanding → 422. (d) Line qty exceeds outstanding → 422. (e) Negative amount → 422. |
| `partial_refund.spec.ts` | (a) Refund 2/5 units of a line → outstanding becomes 3. (b) Two partial refunds sum correctly. (c) Order stays in current status while outstanding > 0. |
| `full_refund.spec.ts` | (a) Refunding sum = grand_total transitions order to `refunded`. (b) Status history row written. |

### Functional

| Spec | Cases |
|---|---|
| `admin_create_full_refund.spec.ts` | (a) Happy path: POST → refund created, order transitions to `refunded`. (b) Non-admin → 403. (c) Already-refunded order → 409. |
| `admin_create_partial_refund.spec.ts` | (a) Line-item refund: partial qty. (b) Two partials, second leaves nothing outstanding → transition to refunded. (c) Cross-tenant 404. |
| `admin_refund_restock.spec.ts` | (a) `restock_requested=true` writes inventory_movements + increments stock. (b) `restock_requested=false` doesn't touch inventory. (c) Restock for a product with `manage_stock=false` is a no-op. |
| `admin_refund_idempotency.spec.ts` | Same `Idempotency-Key` returns same refund; no duplicate ledger writes. |
| `admin_notes.spec.ts` | (a) Internal note created. (b) Customer note created + email queued. (c) GET filters by type. (d) DELETE removes. |
| `customer_notes_visibility.spec.ts` | (a) Customer endpoint returns only `customer` notes. (b) Admin endpoint returns both. (c) Cross-tenant 404. |
| `order_history_timeline.spec.ts` | (a) Customer endpoint returns sanitized rows. (b) Admin endpoint returns full rows incl. actor. (c) System-emitted rows (e.g. payment success) appear. |

## Definition of done

- [ ] Migrations apply; `refund_number_seq` sequence created.
- [ ] `refund_service.create` is transactional and idempotent.
- [ ] Stock restoration uses `inventory_service` (phase 02).
- [ ] Status transition fires when order is fully refunded.
- [ ] PR body shows: create order, refund 1 line item partially, refund remainder, observe transition to `refunded`.
- [ ] `start/routes.ts` uncomments `admin_refunds.ts` + `admin_notes.ts`.
