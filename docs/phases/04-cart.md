# Phase 04 — Cart

> Server-side cart: add/update/remove items, totals (subtotal, tax, shipping rates, grand total), update customer addresses for shipping/tax calc. Stops short of checkout — `POST /checkout` lands in phase 05.

**Branch:** `phase/04-cart`
**Prerequisites:** phase-01 (tax + shipping data), phase-02 (products + variations + inventory), phase-03 (customer + auth optional)
**Parallel with:** none — solo phase
**Migration timestamp block:** `1747400000000`–`1747499999999`
**Estimated scope:** ~3 migrations, ~3 models, ~7 endpoints, ~20 tests.

## Goal

After this PR:

- Storefront can create a cart implicitly on first request (opaque `cart_token` cookie or `Authorization` bearer link), add/update/remove items, switch shipping address, select a shipping rate, view computed totals.
- Total computation runs the WooCommerce-equivalent pipeline (items → discounts placeholder → shipping → taxes → grand total).
- Stock is **not yet decremented**; cart is non-reservation (reservation happens at order create in phase 05).
- A nightly cron purges anonymous carts older than `inventory.cart_abandonment_days` setting (default 30).

## Files this phase owns

```
apps/api/
├── start/routes/
│   └── cart.ts                                    # all cart endpoints
├── database/
│   └── migrations/
│       ├── 1747400000000_create_carts_table.ts
│       ├── 1747400100000_create_cart_items_table.ts
│       └── 1747400200000_create_cart_applied_coupons_table.ts
├── app/
│   ├── models/
│   │   ├── cart.ts
│   │   ├── cart_item.ts
│   │   └── cart_applied_coupon.ts
│   ├── controllers/
│   │   └── cart_controller.ts                     # single resource controller with action methods
│   ├── middleware/
│   │   └── cart_middleware.ts                     # resolves cart from cookie OR creates one
│   ├── validators/
│   │   └── cart_validator.ts
│   └── services/
│       ├── cart_totals_service.ts                 # pure-ish, accepts (cart, addresses, shipping_rate) → totals
│       ├── tax_calculator.ts                      # rate matching + compound/priority logic per ADR
│       └── shipping_rate_service.ts               # zone resolution + method enumeration
└── tests/
    ├── unit/cart/
    │   ├── cart_totals.spec.ts                    # the math
    │   ├── tax_calculator.spec.ts                 # priority + compound
    │   └── shipping_rate.spec.ts                  # zone resolution
    └── functional/cart/
        ├── cart_lifecycle.spec.ts
        ├── cart_items.spec.ts
        ├── cart_customer.spec.ts
        ├── cart_shipping.spec.ts
        └── cart_totals_endpoint.spec.ts
```

## Schema (ADR §"Cart")

| Table | Notes |
|---|---|
| `carts` | `id, token CHAR(40) UNIQUE (random base32), customer_id FK NULLABLE, currency CHAR(3), country CHAR(2) NULLABLE (derived from address), province_code NULLABLE, postcode NULLABLE, shipping_zone_method_id FK NULLABLE (selected rate), ip_address INET, user_agent TEXT, last_activity_at, abandoned_at NULLABLE, attributes JSONB`. Index on `(customer_id)` + `(last_activity_at)` for cleanup. |
| `cart_items` | `id, cart_id FK, product_id FK, variation_id FK NULLABLE, quantity INT (≥1), price_snapshot BIGINT (resolved at add-time — sale or regular), attributes_snapshot JSONB (variant attribute display names)`. UNIQUE `(cart_id, product_id, variation_id)`. |
| `cart_applied_coupons` | `(cart_id, coupon_id, code_snapshot)`. Empty until phase 06 wires the apply endpoint. |

`carts.currency` defaults to `settings.general.currency`. Per ADR D1, single-currency-per-deployment in MVP.

## Cart resolution (middleware)

`cart_middleware.ts`: priority order
1. If `auth.user` exists → load (or create) the cart with `customer_id = user.id`.
2. Else if request has cookie `cart_token` → load that cart.
3. Else create a new cart, set cookie `cart_token` (HTTP-only, SameSite=Lax, 30-day TTL).

On every cart-affecting request, bump `last_activity_at`. On logout we do NOT delete the cart — the next anonymous visit creates a fresh one; the user may also re-login and recover.

When an anonymous cart's owner logs in mid-session: merge into the user's existing cart if one exists (sum quantities by `(product_id, variation_id)`); otherwise reassign `customer_id`. Implement as `cart.assignCustomer(customerId)` on the model.

## Endpoints

All under `/api/v1/cart` (`start/routes/cart.ts`):

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/` | — | Returns full cart + totals. |
| `POST` | `/items` | `{product_id, variation_id?, quantity}` | Add to cart. If `(product_id, variation_id)` already exists, increments. Validates stock (`stock_status=outofstock` → 422; `sold_individually=true` → cap at 1). |
| `PATCH` | `/items/:line_id` | `{quantity}` | Set quantity. `0` removes. |
| `DELETE` | `/items/:line_id` | — | Remove. |
| `DELETE` | `/items` | — | Empty the cart. |
| `POST` | `/customer` | `{country, province_code?, postcode?}` | Update derived address fields used for shipping/tax calc. Does NOT save to customer's address book. |
| `POST` | `/shipping-rate` | `{shipping_zone_method_id}` | Select a shipping rate. Validates the method is in the cart's matched zone. |

Response envelope for every endpoint (idempotent — always returns the cart, even on POST):

```json
{
  "data": {
    "id": 123, "token": "…", "currency": "IRR", "currency_display": "IRT",
    "items": [{ "id": 1, "product_id": 42, "variation_id": null, "name": "…", "sku": "…", "price": 5000000, "quantity": 2, "subtotal": 10000000, "subtotal_tax": 909091, "total": 10000000, "total_tax": 909091, "image": "…" }],
    "applied_coupons": [],
    "shipping_rates": [{ "id": 7, "method_code": "post_pishtaz", "title": "پست پیشتاز", "total": 500000, "total_tax": 0, "selected": true }],
    "address": { "country": "IR", "province_code": "THR", "postcode": "1234567890" },
    "totals": {
      "items_total": 10000000, "items_tax_total": 909091,
      "shipping_total": 500000, "shipping_tax_total": 0,
      "discount_total": 0, "discount_tax_total": 0,
      "tax_total": 909091, "grand_total": 10500000,
      "needs_shipping": true, "needs_payment": true
    }
  }
}
```

All money is integer Rial minor units.

## Total computation pipeline (matches ADR §"Shipping/tax/coupon math")

`cart_totals_service.calculate(cart, address, selectedRateId)`:

1. **Line subtotals.** For each `cart_item`: `price_snapshot * quantity = subtotal`. If `tax.prices_include_tax = true`, the snapshot already includes VAT — extract base via `base = round(snapshot / (1 + rate))`.
2. **Discounts (phase 04 stub).** Discount_total = 0 until phase 06 wires `WC_Discounts`-equivalent. Hook in `cart_totals_service` with a `Discounter` interface; phase 06 implements.
3. **Shipping totals.** Resolve eligible methods via `shipping_rate_service.eligibleFor(address)`. If `selectedRateId` is in the eligible set → its cost. Else (no selection yet) → 0 + the array of eligible rates is returned in the response so the client can pick.
4. **Tax.** Per line: `tax_calculator.calc(class, base, address)`. Plus shipping tax (rate's `applies_to_shipping=true`). Sum into `tax_total`.
5. **Grand total.** `items_total + shipping_total + fees (0 in MVP) + tax_total - discount_total`.

All rounding is banker's rounding to whole Rials (integer).

## Services

### `tax_calculator.ts`
- Input: `tax_class_id`, `country`, `province_code?`, `amount`.
- Match `tax_rates` where `tax_class_id` matches AND `country` matches (`NULL` = any) AND `province_code` matches (`NULL` = any). Order by `priority ASC, ordering ASC`. At most one non-compound rate per priority is applied.
- Compound rates apply on top of the running tax total.
- Returns `{ tax: number, breakdown: [{rate_id, label, rate_percent, amount}] }`.

### `shipping_rate_service.ts`
- Input: address.
- Output: list of `{shipping_zone_method_id, method_code, title, cost, eligible_reason?}`.
- Matching: per ADR D15, auto-rank zone locations by specificity (postcode > state > country > continent), pick the highest-specificity match across all zones; if none, the fallback zone (`is_fallback=true`).
- Each zone-method's `cost` comes from `settings JSONB.cost` field (BIGINT). `free_shipping` honors `min_amount` against the cart's items_total.

### `cart_totals_service.ts`
- Pure function over its inputs (cart, address, selected_rate_id, discounter). Easy to unit-test.

## Validators

`cart_validator.ts`:
- `add_item`: `product_id` exists + not soft-deleted + `status='publish'`; `variation_id` (if present) belongs to product; `quantity` ≥ 1.
- `update_item`: `quantity` ≥ 0 (0 means remove).
- `update_customer`: `country` ISO-3166-1 alpha-2; if IR, `province_code` references provinces, `postcode` matches `/^\d{10}$/`.
- `select_shipping`: `shipping_zone_method_id` must be in the eligible set for the current cart address (controller-level cross-validation).

## Cron / cleanup

Add an Ace command `cart:purge` that deletes anonymous carts where `last_activity_at < now() - settings.cart_abandonment_days`. Job runs via the host's cron or Adonis scheduler (defer Adonis scheduler config; document the cron line in PR body).

## Tests

### Unit (`tests/unit/cart/`)

| Spec | Cases |
|---|---|
| `cart_totals.spec.ts` | (a) Single line, no shipping selected → items_total + 0 shipping + tax. (b) Tax-inclusive prices → tax extracted correctly (10% inclusive of 11,000,000 → base 10,000,000, tax 1,000,000). (c) Multiple lines: totals sum. (d) Free shipping coupon (stubbed) shows shipping_total=0. (e) Negative discount + small items doesn't underflow. (f) Banker's rounding on odd values. |
| `tax_calculator.spec.ts` | (a) Standard 10% rate matches IR address. (b) No match → 0 tax. (c) Two priorities → only highest-priority non-compound applies. (d) Compound rate stacks. (e) Foreign address with no matching rate → 0. |
| `shipping_rate.spec.ts` | (a) IR address returns Iran-zone methods. (b) Foreign address returns fallback-zone methods. (c) Free shipping eligibility honors `min_amount`. (d) Postcode-specific zone wins over country-specific. |

### Functional (`tests/functional/cart/`)

| Spec | Cases |
|---|---|
| `cart_lifecycle.spec.ts` | (a) First GET creates cart + sets cookie. (b) Second GET with cookie returns same cart. (c) Authenticated GET creates customer-linked cart. (d) Login mid-session merges anon cart into customer cart. (e) Cart abandonment cron deletes carts older than threshold. |
| `cart_items.spec.ts` | (a) Add item → 200 + cart returned. (b) Add same SKU twice → quantity incremented (no duplicate row). (c) PATCH quantity=0 removes. (d) DELETE single line. (e) Add variation requires parent product variable. (f) `sold_individually=true` caps quantity at 1. (g) Out-of-stock product → 422. |
| `cart_customer.spec.ts` | (a) POST customer with IR address → totals recomputed with tax. (b) POST customer with US address → totals recomputed (typically 0 tax). (c) Missing province for IR → 422. |
| `cart_shipping.spec.ts` | (a) After address set, `shipping_rates` populated. (b) Selecting an ineligible rate → 422. (c) Selecting a valid rate updates `shipping_total`. (d) Switching address invalidates previously-selected rate. |
| `cart_totals_endpoint.spec.ts` | End-to-end: add 2 items, set IR address, select Tipax shipping → assert `grand_total = items_total + shipping_total + tax_total`. |

## Definition of done

- [ ] All migrations apply.
- [ ] All listed tests pass.
- [ ] Anonymous cart cookie set on first request; persists across requests.
- [ ] Cart resolved correctly when user logs in mid-session (merge semantics).
- [ ] Pure `cart_totals_service` is unit-testable without DB (accepts plain objects).
- [ ] PR body includes a curl walkthrough: add item, set address, select rate, GET cart.
- [ ] `start/routes.ts` uncomments the cart import.
