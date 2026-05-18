# Phase 08 — Payments

> Generic redirect-PSP adapter pattern, `payment_attempts` table, init + callback flow, refund hook. Ship with ZarinPal as the reference adapter; IDPay, NextPay, Pay.ir, Zibal scaffolded but disabled by default.

**Branch:** `phase/08-payments`
**Prerequisites:** phase-05-orders. **Soft dep** on phase-07 (refund hook is a no-op if phase-07 isn't merged). Read [`09-extensibility-patterns.md`](./09-extensibility-patterns.md) — Pattern 6 applies (payment_links table).
**Parallel with:** phase-07-refunds
**Migration timestamp block:** `1747800000000`–`1747899999999`
**Estimated scope:** ~2 migrations, ~3 models, ~8 endpoints, ~30 tests.

## Goal

After this PR:

- `POST /checkout/submit` returns a `payment.redirect_url` for redirect gateways (instead of the phase-05 stub).
- Gateway callback endpoint verifies + transitions order to `processing` (or `failed`).
- Refunds flowing through a gateway-supporting PSP call the adapter's `refund()`.
- Admin can edit per-gateway settings (merchant_id, api_key, …) and enable/disable.
- Adapter pattern keeps Iranian PSP-specifics out of the core order code.

## Files this phase owns

```
apps/api/
├── start/routes/
│   ├── payment.ts                                 # storefront: init redirect + callbacks
│   └── admin_payments.ts                          # admin settings + payment attempt list
├── database/
│   └── migrations/
│       ├── 1747800000000_create_payment_attempts_table.ts
│       ├── 1747800100000_alter_orders_link_payment_attempt.ts   # adds orders.last_payment_attempt_id (FK, nullable)
│       └── 1747800200000_create_payment_links_table.ts          # Pattern 6 — schema-only, no endpoints in MVP
├── app/
│   ├── models/
│   │   ├── payment_attempt.ts
│   │   └── payment_link.ts                        # Pattern 6 — minimal model; controllers ship with a future feature
│   ├── controllers/
│   │   ├── payment_controller.ts                  # init (server-to-server), callback (PSP-redirected user)
│   │   └── admin/
│   │       ├── payment_gateways_controller.ts     # full CRUD on payment_gateways
│   │       └── payment_attempts_controller.ts     # read-only list + show
│   ├── services/
│   │   ├── payment_adapter_registry.ts            # gateway_code → adapter resolver
│   │   ├── payment_service.ts                     # orchestrates init + verify across adapters
│   │   ├── adapters/
│   │   │   ├── base_redirect_gateway.ts           # interface + shared HTTP helpers
│   │   │   ├── zarinpal_gateway.ts                # reference implementation
│   │   │   ├── idpay_gateway.ts                   # scaffold (throw NotConfigured)
│   │   │   ├── nextpay_gateway.ts                 # scaffold
│   │   │   ├── payir_gateway.ts                   # scaffold
│   │   │   ├── zibal_gateway.ts                   # scaffold
│   │   │   ├── cod_gateway.ts                     # special: no redirect, marks pending → on_hold immediately
│   │   │   └── bank_transfer_gateway.ts           # special: no redirect, marks pending → on_hold + bank info note
│   ├── validators/
│   │   └── payments/
│   │       ├── init_validator.ts
│   │       └── callback_validator.ts
│   └── exceptions/
│       └── payment_exceptions.ts                  # NotConfigured, VerifyFailed, AmountMismatch, AlreadyVerified
└── tests/
    ├── unit/payments/
    │   ├── payment_adapter_registry.spec.ts
    │   ├── zarinpal_gateway.spec.ts               # mocked HTTP
    │   ├── cod_gateway.spec.ts
    │   ├── bank_transfer_gateway.spec.ts
    │   └── amount_match.spec.ts                   # idempotency + amount-mismatch guard
    └── functional/payments/
        ├── checkout_submit_redirect.spec.ts       # phase-05 integration
        ├── callback_success.spec.ts
        ├── callback_failure.spec.ts
        ├── callback_replay.spec.ts                # idempotent
        ├── callback_amount_tampered.spec.ts
        ├── admin_gateway_settings.spec.ts
        └── admin_payment_attempts_list.spec.ts
```

## Schema (ADR §"Payments")

`payment_attempts`:
- `id BIGSERIAL PK`
- `order_id` FK NOT NULL
- `gateway_id` FK → `payment_gateways.id` NOT NULL
- `gateway_code_snapshot VARCHAR(50) NOT NULL` — survives gateway-row deletion
- `status` enum `initiated | awaiting_callback | verified | failed | cancelled | refunded`
- `amount_minor BIGINT NOT NULL`
- `currency CHAR(3) NOT NULL`
- `gateway_authority VARCHAR(100) NULLABLE` — PSP intermediate token (ZarinPal `Authority`, IDPay `id`)
- `gateway_transaction_id VARCHAR(100) NULLABLE`
- UNIQUE `(gateway_id, gateway_transaction_id)` — protects double-verify
- `gateway_payload JSONB DEFAULT '{}'`
- `idempotency_key VARCHAR(64) NULLABLE UNIQUE`
- `error_code VARCHAR(50) NULLABLE`
- `error_message TEXT NULLABLE`
- `initiated_at TIMESTAMPTZ DEFAULT now()`
- `verified_at TIMESTAMPTZ NULLABLE`

Indexes: `(order_id)`, `(gateway_id, status)`, `(initiated_at DESC)`.

`orders.last_payment_attempt_id` (FK, nullable) added in migration `1747800100000` — read-side helper to grab the latest attempt without a sub-query.

`payment_links` (Pattern 6) — schema only this phase, no endpoints yet:
- `id BIGSERIAL PK`
- `code VARCHAR(32) UNIQUE NOT NULL` — public slug (base32, ~40 bits entropy)
- `status VARCHAR(20) NOT NULL` — `active | paid | expired | voided`
- `gateway_id` FK NULL — null = customer picks at pay page
- `amount_minor BIGINT NOT NULL`, `currency CHAR(3) NOT NULL`
- `description TEXT NULL`
- `max_uses INT NOT NULL DEFAULT 1`, `used_count INT NOT NULL DEFAULT 0`
- `expires_at TIMESTAMPTZ NULL`
- `order_id` FK NULL — pre-bound to an existing order, optional
- `created_by_user_id` FK NULL
- `attributes JSONB DEFAULT '{}'`, `created_at`, `updated_at`

Future payment-link controller will write `payment_attempts` rows through the same `payment_service` orchestrator (no parallel code path). Schema exists now so adding the feature is a controller + route + adapter bridge, not a hot-table migration.

## Endpoints

### Storefront payment (`start/routes/payment.ts`, prefix `/api/v1/payment`)

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/init` | `{order_key}` | Initialize a `payment_attempts` row + call adapter's `init()` → returns `{redirect_url}`. Idempotent on `order_key` if there's a pending attempt. |
| `GET\|POST` | `/callback/:gateway_code` | (PSP-defined) | PSP redirects user here with status query params or POST body. Adapter parses; controller calls `payment_service.verify()`. Redirects user to `/checkout/success?order_key=…` or `/checkout/failed?order_key=…`. |

The `phase-05` `POST /checkout/submit` is updated:
- If gateway is `cod` or `bank_transfer` (no redirect needed) → adapter's special path runs, order goes to `on_hold` with appropriate note; response has no `redirect_url`.
- Else → creates the `payment_attempts` row + calls `payment_service.init(order)` → returns `{order, payment: { redirect_url }}`.

### Admin (`start/routes/admin_payments.ts`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/payment-gateways` | List with settings (sensitive fields masked). |
| `GET` | `/payment-gateways/:id` | Single. |
| `PATCH` | `/payment-gateways/:id` | Update settings + enabled/ordering. |
| `GET` | `/payment-attempts` | Paginated, filter by `gateway_code`, `status`, `order_id`. |
| `GET` | `/payment-attempts/:id` | Single (full `gateway_payload`). |

## Adapter interface (`base_redirect_gateway.ts`)

```ts
export interface PaymentAdapter {
  readonly code: string
  readonly capabilities: { redirect: boolean; refunds: boolean; partial_refunds: boolean }

  init(args: {
    order: Order
    attempt: PaymentAttempt
    settings: Record<string, unknown>
    return_url: string                              // callback URL for this PSP
  }): Promise<{ authority?: string; redirect_url: string; payload?: unknown }>

  parseCallback(args: {
    request: HttpContext['request']
    settings: Record<string, unknown>
  }): { authority?: string; transaction_id?: string; status: 'success' | 'failed' | 'cancelled'; payload: unknown }

  verify(args: {
    attempt: PaymentAttempt
    callback: ReturnType<PaymentAdapter['parseCallback']>
    settings: Record<string, unknown>
  }): Promise<{ ok: true; transaction_id: string; payload: unknown }
        | { ok: false; error_code: string; error_message: string; payload: unknown }>

  refund?(args: {                                   // optional — only for `capabilities.refunds=true`
    attempt: PaymentAttempt
    amount_minor: number
    reason?: string
    settings: Record<string, unknown>
  }): Promise<{ ok: true; gateway_refund_id: string }
            | { ok: false; error_code: string; error_message: string }>
}
```

Special adapters (`cod`, `bank_transfer`): implement `init` to return `redirect_url=null` and set order status directly to `on_hold` (with a customer-visible note for bank_transfer including the IBAN from settings). They have no `verify` / `parseCallback`.

## ZarinPal reference adapter (`zarinpal_gateway.ts`)

Per ZarinPal v4 REST docs (public API; URLs are settings-overridable for sandbox):
- `init`: POST `https://payment.zarinpal.com/pg/v4/payment/request.json` with `{merchant_id, amount, callback_url, description, metadata}` → response `{data: {code, authority}}`. Returns `redirect_url = https://payment.zarinpal.com/pg/StartPay/{authority}`.
- `parseCallback`: GET callback with `?Authority=…&Status=OK|NOK`.
- `verify`: POST `https://payment.zarinpal.com/pg/v4/payment/verify.json` with `{merchant_id, amount, authority}` → response `{data: {code, ref_id, …}}` → `code=100` is success (`transaction_id = ref_id`), other codes → failure.
- `refund`: ZarinPal v4 has a refund API (`/pg/v4/payment/refund.json`); declare `capabilities.refunds=true` but allow per-merchant override via settings (`refunds_enabled: false`) for merchants whose tier doesn't include it.

**Amount unit**: ZarinPal v4 amount = Rial (matches our canonical unit). The historical Toman/divisor mess is handled by older v3 plugins — we don't carry it.

**HTTP client**: use Adonis's `@adonisjs/core/services/router`-bundled `got`-style fetch wrapper, or plain `fetch` in Node 22+. Set timeouts (5s init, 10s verify). All HTTP errors → `error_code='gateway_timeout'`.

## `payment_service.ts`

Top-level orchestrator:

```ts
class PaymentService {
  async init(order: Order, gatewayId: number, idempotencyKey: string | null): Promise<PaymentAttempt>
  async verifyCallback(gatewayCode: string, request): Promise<{ order: Order; redirect: string }>
  async refund(order: Order, amount_minor: number, reason?: string): Promise<{ ok, gateway_refund_id? }>
}
```

`verifyCallback` flow:
1. Resolve gateway by code → load adapter.
2. `parseCallback` → returns `authority` + status.
3. Look up the matching `payment_attempts` row by `(gateway_id, gateway_authority)`. Lock with `FOR UPDATE`.
4. If status `cancelled` → mark attempt cancelled, transition order to `failed` (if currently `pending`).
5. If status `failed` → adapter `verify` may still be called for the audit detail; mark failed.
6. If status `success`:
   a. **Amount guard**: re-verify the amount the PSP says vs `attempt.amount_minor` — mismatch → `AmountMismatch` exception, attempt → failed.
   b. **Idempotency**: if attempt already `verified`, no-op (return existing redirect).
   c. Call adapter `verify`. On success, set `attempt.status='verified'`, `gateway_transaction_id`, `verified_at`. Run `order_state_machine.transition(order, 'processing', {reason:'payment_verified'})` — which sets `date_paid_at`.
7. Return `{order, redirect}` (the redirect is the storefront's success/failed URL, configurable in `settings.general.checkout_return_url`).

All of the above runs inside a transaction. UNIQUE `(gateway_id, gateway_transaction_id)` prevents double-credit if the PSP retries the callback.

## Settings (added to phase-01 settings table)

- `general.checkout_return_url_success` (default `https://localhost:3000/checkout/success`)
- `general.checkout_return_url_failed` (default `https://localhost:3000/checkout/failed`)
- `payments.callback_base_url` (default `http://localhost:3333` — must be a public URL in prod for PSP reachability)

## Validators

- `init_validator`: `order_key` exists + order in (`draft`, `pending`, `failed`, `on_hold`).
- `callback_validator`: gateway-code-specific shape (some accept GET, some POST). Defer the per-PSP query/body validation to the adapter's `parseCallback`.

## Tests

### Unit

| Spec | Cases |
|---|---|
| `payment_adapter_registry.spec.ts` | (a) Each known code resolves. (b) Unknown code throws `NotConfigured`. (c) Disabled gateway in DB → throws even if code is registered. |
| `zarinpal_gateway.spec.ts` | Mock HTTP. (a) `init` calls right URL with right body, returns redirect_url. (b) Init failure → propagates `error_code`. (c) `verify` happy path. (d) `verify` returns `code != 100` → failure. (e) Amount mismatch in verify response → throws. (f) `refund` happy path. |
| `cod_gateway.spec.ts` | (a) `init` doesn't HTTP-call anything. (b) Sets order to `on_hold` with note. |
| `bank_transfer_gateway.spec.ts` | (a) Note body includes IBAN + account name from settings. |
| `amount_match.spec.ts` | (a) Verify with same amount succeeds. (b) Verify with different amount → fails + `AmountMismatch`. (c) Replayed callback for already-verified attempt is a no-op (idempotent). |

### Functional

| Spec | Cases |
|---|---|
| `checkout_submit_redirect.spec.ts` | (a) Submit with `zarinpal` gateway returns `redirect_url`. (b) Submit with `cod` returns no redirect + order on_hold. (c) Submit with disabled gateway → 422. |
| `callback_success.spec.ts` | (a) Successful callback transitions order to `processing`. (b) Status history row written. (c) `attempt.verified_at` set. (d) User redirected to success URL. |
| `callback_failure.spec.ts` | PSP returns NOK / verify fails → order to `failed`, attempt to `failed`, redirect to failed URL. |
| `callback_replay.spec.ts` | Same PSP callback hits the endpoint twice → second is a no-op, no double-transition. |
| `callback_amount_tampered.spec.ts` | Force amount mismatch (mocked) → attempt fails, order to `failed`, no transition to processing. |
| `admin_gateway_settings.spec.ts` | (a) PATCH enables a gateway. (b) Sensitive fields (`merchant_id`, `api_key`) masked on GET. (c) Non-admin → 403. |
| `admin_payment_attempts_list.spec.ts` | (a) Paginated. (b) Filter by gateway_code. (c) Single attempt includes full `gateway_payload`. |

## Definition of done

- [ ] Migrations apply.
- [ ] ZarinPal adapter end-to-end testable against a sandbox (or fully mocked). PR body documents the sandbox merchant_id used.
- [ ] Phase-05 `submit` endpoint upgraded to return `redirect_url` for redirect gateways.
- [ ] Phase-07 refund hook calls adapter `refund` when gateway supports it (silent no-op when not).
- [ ] All listed tests pass.
- [ ] PR body shows: end-to-end happy path with mocked ZarinPal — login, cart, submit → redirect, simulated callback → order `processing`.
- [ ] `start/routes.ts` uncomments `payment.ts` + `admin_payments.ts`.
