# Phase 09 — Extensibility Patterns (cross-cutting polish)

> Not a feature phase. A set of cross-cutting design patterns that keep the schema clean for foreign customers + clean for post-MVP features (proforma/invoice documents, payment links, additional countries, future regulations). Read this BEFORE writing any phase. Phases 01, 03, 05, and 08 have been amended to follow these patterns — if a phase doc and this doc disagree, this doc wins.

**Branch:** n/a — patterns to apply within each phase's branch.
**Prerequisites:** none. Read first.

## Why this exists

Iran-specific commerce has three demands that risk leaking into the core schema:

1. **Personal/legal identifiers** (`کد ملی`, `شناسه ملی`, `کد اقتصادی`) — required for VAT invoices in Iran, irrelevant elsewhere.
2. **Administrative regions** (31 provinces with 3-letter codes) — Iran-specific naming/structure.
3. **Postal codes** (10-digit no-dash) — distinct from every other country.

And the storefront baseline is the agency's **template for many client deployments**, some of which may serve only Iran, some Iran + diaspora, some pure international. Plus we need to leave room for features clients commonly request: pre-invoice (`پیش‌فاکتور`), invoice (`فاکتور`), shareable payment links, bilingual invoices.

The patterns below extract those concerns out of the per-domain phases into reusable hooks.

---

## Pattern 1 — Country-scoped regions (replaces single-country `provinces`)

**Problem with phase-01's `provinces` table:** hardcoded to Iran. Adding Iraq, Turkey, or UAE requires a schema migration + every consumer to learn a new table.

**Pattern:**

```sql
CREATE TABLE regions (
  id           BIGSERIAL PRIMARY KEY,
  country_code CHAR(2)     NOT NULL,             -- ISO-3166-1 alpha-2
  code         VARCHAR(10) NOT NULL,             -- ISO-3166-2 subdivision code (e.g. IR-TEH, US-CA)
  parent_id    BIGINT      REFERENCES regions(id),  -- nullable; supports city-under-state if a country wants it
  ordering     INT         NOT NULL DEFAULT 0,
  attributes   JSONB       NOT NULL DEFAULT '{}',
  UNIQUE (country_code, code)
);

CREATE TABLE region_translations (
  region_id BIGINT       NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  locale    VARCHAR(8)   NOT NULL,
  name      VARCHAR(120) NOT NULL,
  PRIMARY KEY (region_id, locale)
);
```

**Phase-01 seeder change:** seed 31 Iran rows with `country_code='IR'` + ISO-3166-2 codes (`IR-THR`, `IR-MZN`, …) + fa/en translations. Same data, generalized container. Adding US states later is `INSERT INTO regions VALUES (…, 'US', 'US-CA', …)` — no migration.

**Downstream code change:**

- `customer_addresses.province_code` → `region_id BIGINT NULLABLE REFERENCES regions(id)`. Add CHECK constraint: `(region_id IS NOT NULL AND region_id_matches_country(region_id, country)) OR region_text IS NOT NULL`.
- `tax_rates.province_code` → `region_id BIGINT NULLABLE REFERENCES regions(id)`. Tax matching now works for any country uniformly.
- `shipping_zone_locations.code` for `type='state'` now stores the region_id (numeric string) instead of a free-text province code.

**Why this matters:** the same VAT-by-region logic that ships for Iran works for the next client who wants per-state US sales tax — no rework.

---

## Pattern 2 — Country-aware address validation (replaces hardcoded IR rules)

**Problem with phase-03:** address validator hardcodes "if IR, postcode `^\d{10}$`, else free-form." Adding the next country adds a branch.

**Pattern:** `CountryAddressRulesService` with a registry of per-country rules. Each country file declares: required fields, postcode regex, region-required flag, region-allowed-values resolver.

```ts
// app/services/country_address_rules/index.ts
import { ir } from './ir.js'
import { defaultRules } from './default.js'

const REGISTRY: Record<string, CountryAddressRules> = { IR: ir }

export function rulesFor(country: string): CountryAddressRules {
    return REGISTRY[country.toUpperCase()] ?? defaultRules
}

export interface CountryAddressRules {
    requiredFields: ReadonlyArray<keyof Address>
    postcodePattern: RegExp | null
    requiresRegion: boolean
    validateRegion?(regionCode: string): Promise<boolean>
    /** Hook for country-specific identifier fields (e.g. Iran's national_id). */
    extensionValidator?(address: Address): Promise<{ ok: true } | { ok: false; field: string; reason: string }>
}

// app/services/country_address_rules/ir.ts
export const ir: CountryAddressRules = {
    requiredFields: ['first_name', 'last_name', 'address_line_1', 'city', 'region_id', 'postcode', 'phone'],
    postcodePattern: /^\d{10}$/,
    requiresRegion: true,
    validateRegion: async (id) => { /* lookup in regions where country_code='IR' */ },
    extensionValidator: async (address) => { /* validates national_id checksum if present */ },
}

// app/services/country_address_rules/default.ts
export const defaultRules: CountryAddressRules = {
    requiredFields: ['first_name', 'last_name', 'address_line_1', 'city', 'country'],
    postcodePattern: null,                 // accept any
    requiresRegion: false,
}
```

**Downstream code change:**

- Phase-03's `address_validator` becomes ~10 lines: call `rulesFor(payload.country)` and apply.
- Adding a new country = new file under `country_address_rules/`. No migrations, no central registry surgery.

---

## Pattern 3 — Country-scoped profile extensions (replaces `customers.attributes.iran.*`)

**Problem with phase-03 (initial draft):** Iran-specific customer fields (`national_id`, `corporate_national_id`, `economic_code`, `company_name`) buried inside `customers.attributes JSONB`. Hard to index, hard to validate cleanly with VineJS, hard to query (`WHERE attributes->>'iran'->>'national_id' = ?` is fragile).

**Pattern:** one optional 1:1 extension table per country/jurisdiction. Foreign customers have NO row in any extension table; the core `customers` row alone is complete.

```sql
CREATE TABLE customer_iran_profiles (
  customer_id              BIGINT      PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  national_id              CHAR(10)    NULL,                          -- کد ملی, checksum-validated
  corporate_national_id    CHAR(11)    NULL,                          -- شناسه ملی
  economic_code            VARCHAR(20) NULL,                          -- کد اقتصادی
  legal_company_name_fa    VARCHAR(200) NULL,                         -- نام کامل حقوقی
  vat_taxpayer_status      VARCHAR(20)  NULL,                         -- e.g. 'consumer' | 'enterprise'
  attributes               JSONB        NOT NULL DEFAULT '{}'
);
```

The same pattern applies for addresses (snapshotted on orders):

```sql
CREATE TABLE order_address_iran_extensions (
  order_address_id      BIGINT      PRIMARY KEY REFERENCES order_addresses(id) ON DELETE CASCADE,
  national_id           CHAR(10)    NULL,
  corporate_national_id CHAR(11)    NULL,
  economic_code         VARCHAR(20) NULL,
  legal_company_name_fa VARCHAR(200) NULL,
  attributes            JSONB       NOT NULL DEFAULT '{}'
);
```

**Phase-03 amendment:** drop the JSONB-buried Iran fields. Add the migration above. Validator: `if (country === 'IR' && body.iran_extension) { … validate + upsert customer_iran_profiles row … }`.

**Why this matters:**

- Foreign customers never touch the table; no nullable noise in the core schema.
- Indexes on `national_id` work normally for fast lookup ("find customer by NID").
- Adding EU VAT-ID is a parallel `customer_eu_vat_profiles` table — same shape, no Iran-coupling.
- Removing Iran support (a future client who doesn't need it) is dropping the migration, not unwinding JSONB structure.

**API shape:** GET `/account/me` returns `{user, customer, profile_extensions: {iran?: {…}, eu_vat?: {…}}}`. Storefront/admin only render extensions for countries they care about.

---

## Pattern 4 — Localized labels via a single i18n catalog

**Problem:** field labels like "ایالت" (region) for IR vs "State" for US risk leaking into per-country if/else in the frontend.

**Pattern:** the API returns *raw values* + *field metadata*. Field metadata includes a `label_key` (e.g. `address.fields.region.label.IR`) that the frontend resolves through its own next-intl catalog. The API never returns translated labels — only translated *content* (product names, descriptions).

```json
GET /api/v1/account/addresses/123
{
  "data": {
    "id": 123, "country": "IR", "region_id": 42, "postcode": "1234567890",
    "iran_extension": { "national_id": "0079877123" }
  },
  "meta": {
    "field_metadata": {
      "region_id": { "label_key": "address.fields.region.label.IR", "values_endpoint": "/api/v1/regions?country=IR" },
      "postcode":  { "label_key": "address.fields.postcode.label.IR", "pattern": "^\\d{10}$" }
    }
  }
}
```

Storefront/admin look up `t(label_key)` from their own catalog. No country branching in the API serializer.

---

## Pattern 5 — Documents (proforma, invoice, packing slip, …) as a generic resource

**Problem:** clients regularly ask for پیش‌فاکتور (proforma) + فاکتور (formal VAT-compliant invoice) + packing slip + delivery note. Adding each as a bespoke table doubles work and tangles refunds, multi-currency, multi-language rendering.

**Pattern:** one `order_documents` table + a pluggable `DocumentRenderer` interface. New document type = new enum value + new renderer; no schema churn.

```sql
CREATE TABLE order_documents (
  id                BIGSERIAL    PRIMARY KEY,
  order_id          BIGINT       NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  type              order_document_type_enum NOT NULL,    -- proforma | invoice | packing_slip | credit_note | …
  number            BIGINT       NULL,                    -- per-type sequence (NULL for proforma drafts)
  locale            VARCHAR(8)   NOT NULL,                -- 'fa' / 'en' / 'fa-en' for bilingual
  currency          CHAR(3)      NOT NULL,
  currency_display  CHAR(3)      NOT NULL,
  amount_minor      BIGINT       NOT NULL,
  status            VARCHAR(20)  NOT NULL,                -- 'draft' | 'issued' | 'voided'
  issued_at         TIMESTAMPTZ  NULL,
  issued_by_user_id BIGINT       NULL REFERENCES users(id),
  pdf_media_id      BIGINT       NULL REFERENCES media(id),
  attributes        JSONB        NOT NULL DEFAULT '{}',   -- per-type extras (tax invoice number, customs ref, …)
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_order_documents_per_type_number
  ON order_documents (type, number) WHERE number IS NOT NULL;
```

```ts
export interface DocumentRenderer {
  readonly type: OrderDocumentType
  render(document: OrderDocument, order: Order): Promise<{ media_id: number; rendered_at: Date }>
}
```

A renderer registry maps `type → renderer`. The MVP ships zero renderers — phases 01–08 don't need them. When a client asks for proforma:

1. Add `'proforma'` to `order_document_type_enum`.
2. Add `ProformaRenderer` (HTML template + Puppeteer or @react-pdf/renderer).
3. Add endpoints: `POST /admin/orders/:id/documents { type: 'proforma' }` (creates draft), `POST /admin/orders/:id/documents/:doc_id/issue` (allocates number + renders PDF + transitions status).
4. No migrations to `orders`, no new state machine.

The same pattern handles `invoice`, `credit_note` (refund-paired), `packing_slip`, `delivery_note`, `customs_declaration`. Number sequences are per-type, fiscal-year-aware via `attributes.fiscal_year` if needed.

**For phase 05:** include the migration for `order_documents` table + enum (empty enum is fine — `CREATE TYPE order_document_type_enum AS ENUM ();` then values added as features land). Or defer entirely until first renderer arrives — pick one. **Recommended: include the empty table + enum in phase 05** so post-MVP feature work is purely additive (no new table introduced later requires a `vacuum`/`reindex` on a hot table).

---

## Pattern 6 — Payment links as a peer resource (not coupled to orders)

**Problem:** clients ask for "send a payment link to a customer over WhatsApp" outside the storefront purchase flow. Coupling to `orders` forces every link to have an order; many shouldn't.

**Pattern:** `payment_links` table parallel to `orders`. A link may be standalone (no order; on payment, an order can be auto-created or just a `payment_attempts` row standalone) OR pre-bound to an existing order.

```sql
CREATE TABLE payment_links (
  id               BIGSERIAL PRIMARY KEY,
  code             VARCHAR(32) UNIQUE NOT NULL,        -- public slug (base32, ~40 bits entropy)
  status           VARCHAR(20) NOT NULL,               -- active | paid | expired | voided
  gateway_id       BIGINT      NULL REFERENCES payment_gateways(id),  -- nullable: customer chooses on the page
  amount_minor     BIGINT      NOT NULL,
  currency         CHAR(3)     NOT NULL,
  description      TEXT        NULL,
  max_uses         INT         NOT NULL DEFAULT 1,
  used_count       INT         NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ NULL,
  order_id         BIGINT      NULL REFERENCES orders(id),  -- pre-bound to an order, optional
  created_by_user_id BIGINT    NULL REFERENCES users(id),
  attributes       JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

When paid: writes one `payment_attempts` row. If `order_id` is set → that order's payment flow runs. Else → either creates a one-line order from `{amount, description}` or stays as a standalone "received payment" with no order (settings-driven default).

**For phase 08:** include the migration for `payment_links` table. Endpoints + UI defer until first asked. The table existing means the future feature is a controller + a route, not a schema migration on a hot table.

---

## Pattern 7 — Extensions JSONB convention

Every entity grew an `attributes JSONB DEFAULT '{}'`. Convention:

- **Never** queried (no `WHERE attributes->>'x' = …` in production code paths).
- **Never** indexed.
- **Always** namespaced by extension: `attributes.iran.foo`, `attributes.eu_vat.bar`, `attributes.shipping_carrier_x.tracking`.
- **Always** has a TS type per namespace, declared in a single `app/types/attributes/<namespace>.ts` file, imported wherever read.
- If a value crosses the "needs query/index" threshold, it's promoted to a real column in a migration.

This keeps JSONB as a release valve, not a substitute for schema design.

---

## Pattern 8 — Settings as the per-deployment knob

Iran-specifics that are tunable per deployment (currency display, VAT rate, country defaults) ride on phase-01's `settings` table — they're not hardcoded in code. Already covered, but reaffirmed:

- `general.country_default` — drives the default country for new customers + address forms.
- `general.locale_default` — already env-driven on the frontend (phase already in `main`).
- `tax.prices_include_tax` — already in phase-01.
- Adding a new client who sells only to the EU: change settings, swap region seeder, swap country-rules file. No code in the order/cart/checkout path changes.

---

## Amendments to existing phase docs

The following phase docs are AMENDED by this pattern doc. Where they conflict, this doc wins.

### Phase 01 — Foundation

- Rename `provinces` migration + seeder to `regions` + `region_translations` per Pattern 1.
- Seed Iran regions with `country_code='IR'` and ISO-3166-2 codes (`IR-THR`, `IR-MZN`, …). Keep Persian + English translations.
- Keep `tax_rates` referencing regions via `region_id`, not `province_code`.

### Phase 03 — Customers + Auth

- Add a migration for `customer_iran_profiles` (Pattern 3). Drop the "stuff goes in `customers.attributes.iran.*`" approach.
- Add a migration for `order_address_iran_extensions` (Pattern 3) at the same time, even though orders land in phase 05 — it costs nothing now and saves a cross-phase table addition later. (Alternatively: defer to phase 05 and require an explicit migration there. **Recommended:** keep the table-create in phase 03 alongside `customers`-related tables for cohesion; phase 05 only references it.)
- Address controllers/validators consume `country_address_rules` (Pattern 2) instead of inline `if country == 'IR'` branches.
- API response shape for `/account/me` includes a `profile_extensions` object (Pattern 3).
- API responses for address resources include `meta.field_metadata` (Pattern 4) for storefront/admin form rendering.

### Phase 05 — Orders + Checkout

- Add the `order_documents` table + empty `order_document_type_enum` (Pattern 5).
- Order address snapshot writes to `order_address_iran_extensions` when Iran extension data was on the customer address being snapshotted.
- `order_addresses.region_id` (not `province_code`).

### Phase 08 — Payments

- Add the `payment_links` table (Pattern 6). No endpoints yet; just the schema.
- Adapter interface returns `{redirect_url}` as today; payment-link controller (future) reuses the same adapter through a thin `payment_link → payment_attempts` bridge.

---

## What this is NOT

- **Not a feature.** No new endpoints, no new business logic in MVP. Pure schema + service-layer ergonomics.
- **Not a license to over-engineer.** Each pattern earns its place by removing duplication in code reviewers can see today: country-branch addresses (3 files), Iran-fields-as-JSONB (5+ join paths), implicit document-renderer rework when proforma lands (would touch order_factory, order_finalizer, refund_service, plus 3 new tables).
- **Not optional.** Phase docs that touched these areas have been amended; the amended versions are authoritative.

## Definition of done (for the patterns themselves)

- [ ] Each amendment above is reflected in its phase doc (this doc edits them; verify before committing).
- [ ] All test cases that mentioned `province_code` are updated to `region_id`.
- [ ] All test cases that referenced Iran-NID-in-JSONB are updated to the extension table.
- [ ] Phase 01 seeder for `regions` covers 31 Iran rows with both fa + en translations.
- [ ] `country_address_rules/default.ts` exists with permissive defaults so unknown countries don't 422.
- [ ] `attributes JSONB` columns have a documented namespace convention (Pattern 7) in the relevant model file headers.
