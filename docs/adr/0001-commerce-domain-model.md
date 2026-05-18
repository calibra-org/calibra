# ADR 0001 — Commerce Domain Model (WooCommerce parity, clean schema)

**Status:** proposed
**Date:** 2026-05-18
**Driver:** `keshavarz20` (solo dev), agency baseline for Persian-language storefronts.

## Context

`apps/api` is an AdonisJS 7 backend (Lucid 22 ORM, VineJS 4 validators, Japa 5 tests, `@adonisjs/auth` 10 with the `access_tokens` guard, `@adonisjs/i18n` 3 keyed off `Accept-Language`, first-party transformer system shaping every response) that needs to give a storefront (`apps/web`) and admin panel (`apps/admin`) the full commerce capability surface of WooCommerce — products, variants, cart, checkout, orders, refunds, customers, coupons, taxes, shipping, payments — but as a **clean modern relational schema** on PostgreSQL 17, not a 1:1 port of WordPress legacy. Webhooks are explicitly **out of scope** (deferred until a real consumer exists).

This ADR is the design checkpoint: agreed here, then we scaffold migrations + models + controllers + seeders in phases.

## Design principles

1. **No EAV.** Every known field is a typed column. `wp_postmeta`, `wp_wc_orders_meta`, plugin `meta_data[]` arrays — all dropped. One optional `attributes JSONB` per entity for genuinely-merchant-defined extensions, never as a query path.
2. **Snapshots are first-class.** Line items, addresses on orders, coupon-line discounts, tax-line rates, payment-method titles — all captured at sale time. Renaming a product or deleting a tax rate never alters historical orders.
3. **Money is `BIGINT` minor units of a canonical currency.** Display divisor and currency code travel with the order; we never round-trip through floats.
4. **Foreign keys are advisory for history, authoritative for live state.** Order line items keep an FK to `products`/`variations` for joins, but the snapshot is the source of truth for receipts.
5. **Translation tables, not columns-per-locale, not JSONB blobs.** One `*_translations` table per translatable entity. Scales to N locales; resolved from `Accept-Language`.
6. **Sentinel-free.** WooCommerce uses `-1` for "unlimited", `0` for "guest", `customer_id=0` for missing. We use `NULL` or domain enums. Never magic numbers.
7. **Idempotency at boundaries.** `POST /checkout` accepts `Idempotency-Key`; payment-gateway callbacks are deduped by `(gateway, transaction_id)` unique index.
8. **State machines as enums + transition tables.** Order status is an enum; transitions are guarded in the model layer; status changes write an audit row.
9. **Money/dates always UTC + canonical unit in DB.** Jalali calendar and Toman are presentation; never persisted.
10. **Single source of truth for catalog locale data lives in shared translation tables**, not duplicated per app. The SDK forwards `Accept-Language`; API resolves once.
11. **Transformers own the response shape, not controllers.** Every entity gets a `BaseTransformer<T>` subclass under `app/transformers/`. Sensitive columns (`password_hash`, `idempotency_key`, gateway secrets) are simply not picked, so they cannot leak. Variants (`forList`, `forDetail`, `forAdmin`) replace branchy "include this field for admin but hide for storefront" logic.
12. **Lucid v22 schema codegen.** `database/schema.ts` is auto-generated from migrations; models extend `<Entity>Schema` and only add relationships / hooks / computed fields. Don't hand-maintain `@column` boilerplate the codegen already provides.

## Decisions made up-front (override here if wrong)

| # | Decision | Why | Alternative considered |
|---|---|---|---|
| D1 | **Single-currency per deployment**, currency code locked on each order at creation. Schema has a `currency` column on every monetary row so multi-currency-later is a column-default change, not a migration. | Agency baseline; multi-currency is a per-client overlay, not a baseline need. | Per-product price lists (multi-currency from day one). |
| D2 | **Canonical money unit = Rial minor units (`BIGINT`).** Display divisor + display currency (`IRR`/`IRT`) carried per-order. | Matches government invoices, banking APIs, VAT filings. Toman is presentation. | Storing Toman (loses 10× precision for any future Rial-denominated integration). |
| D3 | **Translation table per translatable entity**: `product_translations`, `category_translations`, `attribute_translations`, `attribute_term_translations`, `tag_translations`, `shipping_class_translations`, `brand_translations`. PK `(entity_id, locale)`. | Scales to N locales without schema churn. Resolves cleanly from `Accept-Language`. | JSONB blob (loses type safety, harder to index for search). Columns-per-locale (capped at 2). |
| D4 | **Order number = sequence-allocated `BIGINT order_number` distinct from opaque `id`.** No template/prefix in MVP; introduce as a settings-driven format later. | `id` stays opaque (security), `order_number` stays compact and gap-free. | Reusing `id`. Templated number from day one (premature). |
| D5 | **Single-location inventory in MVP**, but inventory split into a separate `inventory_items` table (one row per stock-managed product/variation) so multi-location is an `inventory_locations` + composite PK upgrade later. | Iranian SMB merchants run physical + online from one stock pool; not worth pre-building multi-warehouse. | Single `stock_quantity` column on products (locks us in). Multi-warehouse from day one (premature). |
| D6 | **Customer ↔ User split.** `users` is auth-only (Adonis `access_tokens`, hashed password, optional roles). `customers` is commerce identity (name fields, default phone, national IDs, commerce profile). 1:1 FK `customers.user_id → users.id`. **Guests get a `customers` row with `user_id = NULL`** and never appear in `users`. | Clean separation; lets B2B and B2C share auth; guests are first-class without the `customer_id=0` hack. | Single `users` table with a `is_customer` flag. |
| D7 | **Multi-address book on customers.** `customer_addresses(id, customer_id, kind, is_default, …)` with `kind ∈ ('billing','shipping','both')` and a partial unique index `WHERE is_default` per `(customer_id, kind)`. | Persian shoppers commonly want home + work + family addresses. Woo's single-default model is restrictive. | Embedded single billing + single shipping on customers (Woo's shape). |
| D8 | **Server-side cart in Postgres**, keyed by an opaque `cart_token` (cookie) or `customer_id` (logged-in). Carts have a TTL (e.g. 30 days for anon, indefinite for logged-in). | Stateless cookie carts get fat fast (price snapshots, applied coupons, shipping selection). Server-side is what every modern stack does. | Stateless signed-cookie cart. |
| D9 | **`checkout-draft` order status as a real step.** `POST /cart` → `POST /checkout` creates a draft order; `POST /checkout/{order_id}/submit` finalizes. 24h cleanup cron purges abandoned drafts. | Lets the user fill billing/shipping/payment fields as they type, persisted server-side. Matches modern Woo Store API. | Cart → directly to `pending` order on submit (no draft). |
| D10 | **Stock reserved on `pending` (not on draft)**, released on `cancelled` / `failed` / `hold_minutes` expiry. Inventory ledger pattern (one row per movement) so reservations are queryable and concurrent-safe. | Reserving on draft causes false-low-stock noise; reserving only on payment over-sells. `pending` is the right compromise. | Reserve on draft (race-y). Reserve on payment (over-sells). |
| D11 | **Refunds as dedicated tables**, not refund-orders. `order_refunds` + `order_refund_line_items`. Money rolled up to the parent via SQL view. | Cleaner query plans. Woo only conflated them because of `wp_posts` constraints. | Reuse `orders` table with `type='refund'` + `parent_order_id`. |
| D12 | **Three explicit join tables**: `product_cross_sells`, `product_upsells`, `product_group_members(group_product_id, member_product_id, position)`. | Reads grep cleanly. A polymorphic `product_links(kind)` table saves one DDL block at the cost of every query growing a `WHERE kind=`. | Polymorphic `product_links`. |
| D13 | **Polymorphic `payment_attempts` table** keyed by `(gateway, payment_attempt_id)` with a `gateway_payload JSONB` for PSP-specific data. One adapter pattern in code, one table for ops. Gateway-specific tables created only if/when a gateway has multi-row workflows worth modeling. | Iran has 10+ active PSPs; one-table-per-gateway sprawls fast. JSONB inside payment_attempts gives gateway-shape latitude without losing the audit row. | One table per gateway (sprawl). One column per gateway field on `orders` (Woo's mess). |
| D14 | **Coupons with a separate `coupon_redemptions` ledger** (one row per use), not a `usage_count` integer. Per-user and global limits enforced via conditional INSERT inside the checkout transaction with `SELECT … FOR UPDATE` on the coupon row. | Counter is racy under concurrency; ledger is auditable, exportable, and supports per-user limit even for guests (matched by `customer_id` OR `email`). | Single integer counter on coupon. |
| D15 | **Shipping zones auto-ranked by specificity** (postcode > state > country > continent). No operator-defined ordering. The "rest of the world" fallback is `is_fallback=true` on one immutable row. | Removes a class of operator error (Woo's manual ordering is a known foot-gun). | Manual ordering as Woo does. |
| D16 | **Tax rates ordered by `priority` (ascending) + `compound` boolean** as in Woo — at most one non-compound rate per priority matches. Iran ships with one `standard` class + 10% national VAT rate; `reduced-rate` and `zero-rate` classes seeded but empty. | The Woo model is genuinely flexible enough for global tax; no reason to reinvent. | Hard-coded single VAT rate. |
| D17 | **Tax displayed inclusive of VAT by default**, configurable via settings (`tax_display_shop`, `tax_display_cart`). | Iranian retail convention. | Tax-exclusive (Western convention). |
| D18 | **Order status is a Postgres enum** (`OrderStatus`), not a row table. Statuses: `draft, pending, on_hold, processing, completed, cancelled, refunded, failed`. Custom merchant statuses deferred until a real need surfaces (it's a `CREATE TYPE … ADD VALUE` migration when it comes). | Enums are faster, type-safe, and self-documenting. Row table is premature flexibility. | Row table from day one. |
| D19 | **Audit log for order status transitions** in `order_status_history(order_id, from_status, to_status, changed_at, changed_by_user_id, reason)`. Every status change writes one row. | Both for customer-facing timeline and internal audit. Woo logs to `wp_comments` (gross). | No audit log. |
| D20 | **Notes are flat (Woo's shape)**, `order_notes(id, order_id, body, visibility, author_user_id, created_at)` with `visibility ∈ ('internal','customer')`. Customer-visible notes can opt-in to email at the controller layer; no field for it on the row. | Flat is what merchants actually use; threading is overhead. | Threaded notes. |
| D21 | **No SOAP gateways in v1.** Only HTTPS+REST PSPs (ZarinPal, IDPay, NextPay, Pay.ir, Zibal). SOAP-only banks (Mellat, Saman, Parsian) deferred until a client needs them. | Each SOAP gateway is a ~1-week build; not worth pre-paying. | Build all PSPs day-one. |
| D22 | **No `system_status` endpoint.** Ops observability lives in Prometheus + healthchecks, not in an HTTP endpoint. | Adonis exposes nothing useful here without bespoke wiring. | Build `/system_status` for parity. |
| D23 | **No `/reports` endpoints in v1.** Admin uses materialized views (`mv_daily_sales`, `mv_top_sellers`) refreshed nightly. Frontend reads them through plain query endpoints. | Real-time reports on transactional tables are expensive. | Compute on every read. |
| D24 | **No `meta_data[]` open extension surface.** Each entity may grow an `attributes JSONB` column for forward-compat, never queried, never schema-validated by us (consumer responsibility). | Open bags become un-typed tech debt. | Allow `meta_data[]` for Woo-shape parity. |
| D25 | **No PHP-style `pa_` slug prefix** on global attributes. Slugs are clean. | Pure leak of WP's taxonomy registry. | Keep for Woo-API parity. |
| D26 | **No webhooks in v1** (per explicit user direction). Domain events are emitted on Adonis's emitter; consumers register listeners in-process. Deferred until first real external consumer appears. | YAGNI. Avoids designing the queue + retry + DLQ + signing now. | Build webhooks day-one. |
| D27 | **REST API auth = Adonis `access_tokens` (opaque bearer)** for first-party clients (web + admin). Machine-to-machine (PoS, ERP, accounting export) gets per-key scoped tokens through the same `access_tokens` table with a `scopes JSONB`. No consumer-key/secret split. | Single auth surface, simpler revocation, scope-grant per token. | Woo's parallel consumer-key model. |
| D28 | **Per-image record (Media)** in a `media` table; products + variations + categories reference `media_id`. Order keeps a `featured_image_id` + ordered `product_images(product_id, media_id, position)` join. Variations get one optional `image_media_id`. | Image deduplication, signed URL story, easy CDN swap. | Embedding URL strings into product rows (Woo's shape). |
| D29 | **Downloadable file = `media_id` + grant ledger**: `customer_downloads(customer_id, product_id, order_id, granted_at, expires_at, download_limit, downloads_used)`. Served via signed URLs at request time. | Per-customer grant is the audit unit, not the product. | Free-text URLs in `product_downloads[]` (Woo). |
| D30 | **National-ID fields on customers and snapshotted on order addresses**: `national_id` (10-digit checksum-validated `کد ملی`), `corporate_national_id` (`شناسه ملی`, 11-digit, for B2B), `economic_code` (`کد اقتصادی`). | Required for VAT-compliant invoices in Iran. | Skip, add later (would need address-snapshot migration). |

## Schema overview

Tables grouped by domain. Every table has `id BIGINT PK`, `created_at`, `updated_at`. Money fields are `BIGINT` (Rial minor units). All `*_translations` tables share the shape `(entity_id BIGINT FK, locale VARCHAR(8), …, PRIMARY KEY (entity_id, locale))`.

### Catalog (~17 tables)

- `media` — `id, kind ('image'|'file'), url, mime, width, height, size_bytes, alt, attributes JSONB`
- `products` — `id, type (enum simple|variable|grouped|external), sku, global_unique_id, status (enum draft|publish|private|pending), catalog_visibility (enum visible|catalog|search|hidden), featured, virtual, downloadable, regular_price, sale_price, sale_starts_at, sale_ends_at, tax_class_id FK, tax_status (enum taxable|shipping|none), shipping_class_id FK, weight_grams, length_mm, width_mm, height_mm, sold_individually, reviews_allowed, purchase_note_id (FK product_translations), external_url, button_text_id (FK product_translations), menu_order, attributes JSONB, deleted_at`
- `product_translations` — `(product_id, locale, name, slug UNIQUE per locale, description, short_description, purchase_note, external_button_text)`
- `product_variations` — `id, product_id FK, sku, regular_price, sale_price, sale_starts_at, sale_ends_at, weight_grams, length_mm, width_mm, height_mm, image_media_id FK, virtual, downloadable, tax_class_id FK, manage_stock_mode (enum own|parent), menu_order, attributes JSONB, deleted_at`
- `product_variation_translations` — `(variation_id, locale, description)`
- `inventory_items` — `id, product_id, variation_id (nullable), location_id (nullable, single null = default in MVP), stock_quantity, manage_stock, backorders (enum no|notify|yes), low_stock_threshold, stock_status (enum instock|outofstock|onbackorder)` — UNIQUE `(product_id, variation_id, location_id)`
- `inventory_movements` — append-only ledger; `id, inventory_item_id, kind (enum sale|return|restock|adjustment|reservation|release), quantity_delta, ref_kind (enum order|refund|manual), ref_id, occurred_at, notes`
- `product_attributes` — `id, code (clean slug, no pa_ prefix), order_by (enum menu_order|name|id), has_archives` 
- `product_attribute_translations` — `(attribute_id, locale, name)`
- `product_attribute_terms` — `id, attribute_id FK, menu_order`
- `product_attribute_term_translations` — `(term_id, locale, name, slug, description)`
- `product_attribute_links` — per-product attribute pinning (used for "additional information" + variation source); `id, product_id FK, attribute_id FK, position, visible, used_for_variation`
- `product_attribute_link_terms` — `(link_id, term_id)` many-to-many for the term options
- `product_variation_attributes` — `(variation_id, attribute_id, term_id)` pins each variation to one term per varying attribute (term_id, not name — D-key insight)
- `product_categories` — `id, parent_id FK self (nullable), display (enum default|products|subcategories|both), image_media_id FK, menu_order`
- `product_category_translations` — `(category_id, locale, name, slug, description)`
- `product_category_links` — `(product_id, category_id)`
- `product_tags`, `product_tag_translations`, `product_tag_links` — same shape minus hierarchy/image
- `product_brands`, `product_brand_translations`, `product_brand_links` — flat (Woo convention)
- `product_shipping_classes`, `product_shipping_class_translations`
- `product_images` — `(product_id, media_id, position)`; position 0 implies featured (no separate column)
- `product_reviews` — `id, product_id FK, customer_id FK (nullable for guest), reviewer_name, reviewer_email, body, rating SMALLINT (1-5), status (enum pending|approved|spam|trash), verified (derived from order history, recomputed on insert)`
- `product_cross_sells`, `product_upsells` — `(product_id, related_product_id)`
- `product_groups`, `product_group_members` — explicit grouped-product membership with `position`
- `product_downloads` — `id, product_id FK, media_id FK, position, download_limit (nullable = unlimited), download_expiry_days (nullable = unlimited), file_label` (a unit, not a key/value)

### Customer / account (~5 tables)

- `users` — `id, email UNIQUE, password_hash, locale, two_factor_secret, last_login_at, deleted_at` (auth-only; Adonis `access_tokens` lives in a separate token table)
- `customers` — `id, user_id FK UNIQUE NULLABLE (null = guest), first_name, last_name, phone E.164, national_id (`کد ملی` 10 digits + checksum), corporate_national_id (`شناسه ملی` 11 digits, nullable), economic_code (nullable), company_name (nullable), is_paying_customer (derived), attributes JSONB`
- `customer_addresses` — `id, customer_id FK, kind (enum billing|shipping|both), label, first_name, last_name, company, address_line_1, address_line_2, city, province_code (FK provinces.code — Iran's 31-province enum), postcode (10 digit), country (ISO-3166-2 alpha-2), phone, is_default BOOL` — partial UNIQUE `(customer_id, kind) WHERE is_default`
- `provinces` — `(code PK, name_fa, name_en)` seeded with the 31 Iranian provinces
- `customer_downloads` — `id, customer_id FK, product_id FK, product_download_id FK, order_id FK, granted_at, expires_at, download_limit, downloads_used`

### Cart (~3 tables)

- `carts` — `id, token (opaque), customer_id FK (nullable), currency, ip_address, user_agent, abandoned_at, last_activity_at` — TTL 30d anonymous, indef. for logged-in
- `cart_items` — `id, cart_id FK, product_id FK, variation_id FK (nullable), quantity, price_snapshot, attributes_snapshot JSONB (for variant attributes display)`
- `cart_applied_coupons` — `(cart_id, coupon_id, coupon_code_snapshot)`

### Orders (~8 tables)

- `orders` — `id, order_number BIGINT UNIQUE (sequence-allocated), order_key (opaque guest-secret), status (OrderStatus enum), customer_id FK NULLABLE, billing_email, currency (locked), currency_display (IRR|IRT, locked), payment_method_id_snapshot, payment_method_title_snapshot, transaction_id (nullable, set on capture), customer_note, items_total, items_tax_total, shipping_total, shipping_tax_total, fees_total, fees_tax_total, discount_total, discount_tax_total, tax_total, grand_total, prices_include_tax BOOL, created_via (enum checkout|admin|api|import), ip_address, user_agent, idempotency_key UNIQUE, cart_hash (nullable), date_paid_at, date_completed_at, deleted_at`
- `order_addresses` — `id, order_id, kind (enum billing|shipping), …same shape as customer_addresses minus is_default/label, plus national_id, corporate_national_id, economic_code` — UNIQUE `(order_id, kind)` (denormalized snapshot)
- `order_line_items` — `id, order_id FK, product_id FK (advisory), variation_id FK (advisory), name_snapshot, sku_snapshot, quantity, subtotal, subtotal_tax, total, total_tax, tax_class_id_snapshot, attributes_snapshot JSONB`
- `order_line_item_taxes` — `(line_item_id, tax_rate_id, tax_amount, shipping_tax_amount)` per-rate breakdown
- `order_shipping_lines` — `id, order_id FK, method_id_snapshot, instance_id_snapshot, title_snapshot, total, total_tax`
- `order_fee_lines` — `id, order_id FK, name_snapshot, tax_class_id_snapshot, taxable, total, total_tax`
- `order_coupon_lines` — `id, order_id FK, coupon_id FK (advisory), code_snapshot, discount, discount_tax`
- `order_tax_lines` — `id, order_id FK, tax_rate_id_snapshot, rate_code_snapshot, label_snapshot, rate_percent_snapshot, compound_snapshot, tax_total, shipping_tax_total`
- `order_status_history` — `id, order_id FK, from_status, to_status, changed_by_user_id, reason, occurred_at` (audit, append-only)
- `order_notes` — `id, order_id FK, body, visibility (enum internal|customer), author_user_id`

### Refunds (~2 tables)

- `order_refunds` — `id, order_id FK, refund_number BIGINT UNIQUE, amount, reason, refunded_by_user_id, restock_requested BOOL, gateway_refund_id (nullable), processed_at`
- `order_refund_line_items` — `id, refund_id FK, order_line_item_id FK, quantity, refund_amount, refund_tax`

### Coupons (~3 tables)

- `coupons` — `id, code UNIQUE CITEXT, discount_type (enum percent|fixed_cart|fixed_product|free_shipping), amount (BIGINT for fixed, NUMERIC(5,2) for percent — split into two nullable columns to keep types clean), expires_at, individual_use, exclude_sale_items, minimum_amount, maximum_amount, usage_limit_global, usage_limit_per_user, limit_usage_to_x_items, free_shipping, status (enum active|disabled), attributes JSONB, deleted_at`
- `coupon_translations` — `(coupon_id, locale, description)`
- `coupon_product_constraints` — `(coupon_id, product_id, mode enum include|exclude)` for per-product include/exclude
- `coupon_category_constraints` — same for categories
- `coupon_email_restrictions` — `(coupon_id, email_pattern)` for `email_restrictions`
- `coupon_redemptions` — `id, coupon_id FK, order_id FK, customer_id FK (nullable), email_snapshot, redeemed_at` — used for usage-limit enforcement

### Tax (~2 tables)

- `tax_classes` — `id, slug UNIQUE, name`
- `tax_rates` — `id, tax_class_id FK, country (ISO alpha-2 or NULL = any), province_code (nullable), postcodes TEXT[] (nullable), cities TEXT[] (nullable), rate NUMERIC(7,4) percent, label, priority SMALLINT, compound BOOL, applies_to_shipping BOOL, ordering INT`

### Shipping (~5 tables)

- `shipping_zones` — `id, name, is_fallback BOOL (one row only, immutable)`
- `shipping_zone_locations` — `(zone_id, type enum continent|country|state|postcode, code)` — specificity computed at query time (postcode=4, state=3, country=2, continent=1) and we sort `ORDER BY specificity DESC, zone_id ASC LIMIT 1` for matching
- `shipping_methods` — registry: `id, code (flat_rate|free_shipping|local_pickup|tipax|post_pishtaz|post_sefareshi|...), title_default, description_default, settings_schema JSONB` (not the values — the schema)
- `shipping_zone_methods` — instances: `id, zone_id FK, method_id FK, title_override, enabled, ordering, settings JSONB` (per-zone values)
- `shipping_zone_method_translations` — `(zone_method_id, locale, title)`

### Payments (~3 tables)

- `payment_gateways` — `id, code UNIQUE (zarinpal|idpay|nextpay|payir|zibal|cod|bank_transfer), enabled, ordering, settings JSONB, supports JSONB (e.g. {refunds: true, partial_refunds: false})`
- `payment_gateway_translations` — `(gateway_id, locale, title, description, customer_instructions)`
- `payment_attempts` — `id, order_id FK, gateway_id FK, status (enum initiated|awaiting_callback|verified|failed|cancelled|refunded), amount_minor_units, currency, gateway_authority (nullable, PSP intermediate token), gateway_transaction_id (nullable, PSP final ref) UNIQUE `(gateway_id, gateway_transaction_id)`, gateway_payload JSONB (PSP-shape data), idempotency_key UNIQUE, initiated_at, verified_at`

### Settings (~1 table)

- `settings` — `(group_key, key, value JSONB, type CHAR(16))` PK `(group_key, key)`. Group keys: `general, products, tax, shipping, account, email, advanced`. Typed-at-read via a settings service; not a free-for-all bag. Used for things like `tax_display_shop`, `tax_display_cart`, `currency_display_default`, `hold_stock_minutes`, `order_number_format`.

**Total: ~55 tables across all domains.** Most are small lookup or join tables; ~12 are the "real" entities.

## REST API surface

All under `/api/v1/*` (versioned per the existing convention). Storefront uses the bearer-token-or-anon variants; admin uses bearer-token with admin scopes.

### Storefront-facing (matches WC Store API shape)

- `GET /catalog/products` — list/filter (params from WC's `_products.md`)
- `GET /catalog/products/:slug` — by slug, with variations + attributes + images expanded
- `GET /catalog/categories` — tree
- `GET /catalog/categories/:slug` — single with products
- `GET /catalog/attributes`, `GET /catalog/attributes/:id/terms`
- `GET /catalog/brands`, `GET /catalog/tags`
- `POST /catalog/products/:id/reviews` — submit review (auth optional)
- `GET /catalog/products/:id/reviews`
- `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:line_id`, `DELETE /cart/items/:line_id`
- `POST /cart/coupons` (apply), `DELETE /cart/coupons/:code`
- `POST /cart/customer` (update billing/shipping addresses for tax/shipping calc)
- `POST /cart/shipping-rate` (select chosen rate)
- `GET /checkout` (draft order from cart)
- `PUT /checkout` (persist additional fields, payment method, customer note)
- `POST /checkout/submit` (finalize; with `Idempotency-Key` header)
- `POST /checkout/orders/:order_key/pay` (guest pay-link for failed/on-hold)
- `GET /account/me`
- `PUT /account/me`
- `GET /account/addresses`, `POST /account/addresses`, `PATCH /account/addresses/:id`, `DELETE /account/addresses/:id`
- `GET /account/orders`, `GET /account/orders/:id`
- `GET /account/downloads`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/password/reset`, `POST /auth/password/forgot`

### Admin-facing (matches WC v3 REST shape)

- `GET|POST|PATCH|DELETE /admin/products`, `…/products/:id`, `POST /admin/products/batch`, `POST /admin/products/:id/duplicate`
- `…/products/:product_id/variations`, batch
- `/admin/products/attributes`, `…/terms`
- `/admin/products/categories`, `/admin/products/tags`, `/admin/products/brands`, `/admin/products/shipping-classes`
- `/admin/products/reviews`
- `/admin/orders`, `POST /admin/orders/:id/notes`, `POST /admin/orders/:id/refunds`
- `/admin/coupons`
- `/admin/customers`, `GET /admin/customers/:id/downloads`
- `/admin/tax/classes`, `/admin/tax/rates`
- `/admin/shipping/zones`, `…/zones/:id/locations`, `…/zones/:id/methods`
- `/admin/shipping-methods` (registry, read-only)
- `/admin/payment-gateways` (read + settings update)
- `/admin/settings/:group`, `…/:group/:id`
- `/admin/reports/sales`, `…/top-sellers`, `…/orders/totals`, `…/products/totals`, `…/customers/totals`, `…/coupons/totals` (driven by materialized views per D23)

All paginated responses use `{ data: T[], meta: { page, perPage, total, lastPage } }` (matches the existing SDK `Paginated<T>` contract).

## Money / currency strategy

- All money is `BIGINT` minor units of **Rial** (1 Toman = 10 Rial).
- `orders.currency` = `'IRR'` (canonical).
- `orders.currency_display` = `'IRT'` or `'IRR'`, locked on order creation, used by the API to format `display_*` fields.
- Inputs: API accepts numbers in canonical Rial minor units. SDK utilities convert to/from Toman major units for UI.
- Tax calc, totals, rounding: all in Rial minor units; never floats. NUMERIC for tax percentages only.
- Multi-currency: schema has `currency` everywhere it matters; switching from single to multi is a code change, not a migration.

## i18n strategy

- API resolves `Accept-Language` (already wired via `detect_user_locale_middleware`) and joins to the appropriate `*_translations` row, falling back to the configured default locale (env-driven).
- Outgoing JSON uses the resolved-locale's `name`, `slug`, `description`. The active locale is reported in a `Content-Language` response header.
- Validators / errors flow through `@adonisjs/i18n` catalogs at `resources/lang/{fa,en}/messages.json`. Already wired.
- Numerals stay ASCII in JSON. Persian-digit rendering is a frontend concern.
- Dates stay ISO-8601 UTC in JSON. Jalali rendering is a frontend concern.

## Persian / Iranian commerce specifics

| Concern | Decision |
|---|---|
| Currency display | IRR canonical, IRT display, locked per order. |
| VAT | 10% national, single `standard` tax class, single rate row. |
| Province field | `province_code` FK to `provinces` (31 enum), not free-text. |
| Postal code | `^[0-9]{10}$` validated; no dash. |
| Phone | E.164 normalized at write (`+98…`). |
| National ID | 10-digit + checksum validation on customer + order address snapshot. |
| Corporate NID | 11-digit `شناسه ملی` + 12-digit `کد اقتصادی`, nullable. |
| Payment gateways v1 | ZarinPal, IDPay, NextPay, Pay.ir, Zibal, COD, bank-transfer. No SOAP banks. |
| Shipping carriers v1 | Post Pishtaz, Post Sefareshi, Tipax, generic `flat_rate`, `free_shipping`, `local_pickup`. Real carrier APIs deferred (most have no public API). |
| Dates in DB | UTC ISO-8601 `timestamptz`. |
| Calendar in UI | Jalali via frontend formatter. |

## Migration plan

**Phase 1 — schema scaffolding** (one PR, no app code):
- All migrations + Lucid models + relationships for: catalog (17 tables), customer (5), cart (3), orders (8), refunds (2), coupons (3), tax (2), shipping (5), payments (3), settings (1).
- Seeders for: tax classes, default Iran VAT rate, provinces (31), shipping zones (Iran + Rest of World), shipping methods registry, payment gateways registry, default settings.
- This PR scaffolds DB structure only; no controllers, no business logic.

**Phase 2 — catalog read API + storefront wiring** (one PR):
- Controllers + validators + tests for catalog read endpoints.
- Idempotent seeder for realistic Persian product catalog (~50 products, 8 categories, 30 attribute terms across 4 attributes, brand sample).
- Storefront `apps/web` consumes via SDK.

**Phase 3 — cart + checkout + orders** (one PR each, or grouped):
- Cart endpoints + persistence.
- Checkout draft + finalize + idempotency.
- Order create/read/list endpoints (admin + customer).
- Stock reservation + release on cancel/expire.

**Phase 4 — coupons + taxes + shipping calc** (one PR):
- Coupon apply/remove on cart.
- Tax pipeline integrated into cart totals.
- Shipping zone matching + rate selection.

**Phase 5 — admin write surface + refunds + notes** (one PR):
- Admin CRUD for products, orders (status transitions, notes), customers, coupons, tax rates, shipping zones, payment gateway settings.
- Refund creation + line-item refunds + stock restore.

**Phase 6 — payments** (one PR per gateway, ZarinPal first):
- Generic redirect-PSP adapter.
- ZarinPal adapter as reference.
- Then IDPay, NextPay, Pay.ir, Zibal incrementally.

**Phase 7 — auth + customer accounts** (one PR):
- Adonis `@adonisjs/auth` configure with `access_tokens` guard.
- Register/login/logout/password reset.
- Customer account routes.

**Phase 8 — reports + materialized views** (one PR):
- Nightly refresh job.
- Admin reports endpoints.

## Seeders plan (realistic Persian data)

- `provinces_seeder` — 31 rows, fa + en names.
- `tax_classes_seeder` — `standard`, `reduced-rate`, `zero-rate`.
- `tax_rates_seeder` — one row: country=IR, class=standard, rate=10%, label="مالیات بر ارزش افزوده".
- `shipping_zones_seeder` — "ایران" zone with `country=IR`, "Rest of World" fallback.
- `shipping_methods_seeder` — registry rows for flat_rate, free_shipping, local_pickup, post_pishtaz, post_sefareshi, tipax.
- `shipping_zone_methods_seeder` — Tipax (cost 80,000 Rial), Post Pishtaz (50,000), free_shipping with min_amount 5,000,000 Rial.
- `payment_gateways_seeder` — registry rows for zarinpal (disabled, needs merchant_id), idpay, nextpay, payir, zibal, cod (enabled), bank_transfer (enabled with IR-style IBAN).
- `settings_seeder` — defaults for currency_display=IRT, tax_display_shop=incl, hold_stock_minutes=60, etc.
- `catalog_demo_seeder` — toggleable via `--demo` flag. ~8 categories (پوشاک، الکترونیک، …), ~50 products across simple + variable, ~30 attribute terms (سایز: S/M/L/XL; رنگ: مشکی/سفید/قرمز…), brand samples, images via Picsum/Lorem Picsum placeholders.

## Open questions (require user sign-off before Phase 1)

These are the truly architecture-bending ones. Defaults are picked above; flag any disagreements:

1. **D6 (Customer/User split)** — confirm split, or do you prefer a single `users` table with a `is_customer` flag?
2. **D8 (Server-side cart)** — confirm Postgres-backed cart, or do you prefer a stateless signed-cookie cart (faster reads, fatter cookies)?
3. **D11 (Refunds as own tables)** — confirm, or follow Woo's "refunds-are-orders" pattern for closer API parity?
4. **D13 (Polymorphic payment_attempts)** — confirm one table for all PSPs, or one table per PSP?
5. **D21 (No SOAP gateways in v1)** — confirm we defer Mellat/Saman/Parsian, or build them all up-front?
6. **D26 (No webhooks)** — confirmed in this session.
7. **D27 (Adonis access_tokens for all auth)** — confirm, or keep a separate consumer-key/secret surface for M2M?
8. **D28 (Per-image Media table)** — confirm, or just store image URLs as strings on products (simpler, less audit)?
9. **D29 (Customer-download grant ledger)** — confirm, or do downloadable files come later (Phase ≥6)?
10. **D30 (National-ID fields up front)** — confirm we collect them at the customer/order level from day one.

Any "no" or "different" on the above means we revise the ADR before any migration is written. Silence on any item = approved.

## Out of scope (explicitly)

- Webhooks (D26).
- Multi-warehouse inventory (D5).
- Per-PSP SOAP integrations (D21).
- `/system_status` endpoint (D22).
- Real-time analytics (`/reports` uses MVs, D23).
- Open extension metadata (D24).
- Application-Passwords (D27).
- Headless CMS for editorial content (out of commerce scope).
- Subscriptions / recurring billing (a future ADR).
- B2B price tiers (a future ADR).
- Multi-currency (designed for, not built day-one — D1).
