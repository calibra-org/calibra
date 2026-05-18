# Phase 01 — Foundation

> Establishes the shared infrastructure every later phase depends on: the route-file split convention, lookup tables, and idempotent seeders with realistic Iran data.

**Branch:** `phase/01-foundation`
**Prerequisites:** none. Lands first, solo.
**Migration timestamp block:** `1747100000000`–`1747199999999`
**Estimated scope:** ~10 migrations, ~10 models, 1 seeder, ~20 tests.

## Goal

Land the bedrock so every parallel phase after this can scaffold its own domain without touching shared files. After this PR:

- `start/routes/*.ts` per-domain route files exist; `start/routes.ts` imports each domain file.
- Lookup tables (provinces, tax classes/rates, shipping zones/methods, payment gateways, settings, media) exist and are seeded with realistic Iran defaults.
- A seeder convention is in place: `database/seeders/main_seeder.ts` runs each domain seeder in order; later phases drop a file alongside.
- `just seed` is idempotent.

## Files this phase owns

```
apps/api/
├── start/
│   ├── routes.ts                                  # MODIFY: import per-domain route files
│   └── routes/
│       └── (nothing yet — established as a convention; phase 02+ drop files here)
├── database/
│   ├── migrations/
│   │   ├── 1747100000000_create_media_table.ts
│   │   ├── 1747100100000_create_regions_table.ts
│   │   ├── 1747100150000_create_region_translations_table.ts
│   │   ├── 1747100200000_create_tax_classes_table.ts
│   │   ├── 1747100300000_create_tax_rates_table.ts
│   │   ├── 1747100400000_create_shipping_zones_table.ts
│   │   ├── 1747100500000_create_shipping_zone_locations_table.ts
│   │   ├── 1747100600000_create_shipping_methods_table.ts
│   │   ├── 1747100700000_create_shipping_zone_methods_table.ts
│   │   ├── 1747100800000_create_payment_gateways_table.ts
│   │   └── 1747100900000_create_settings_table.ts
│   └── seeders/
│       ├── main_seeder.ts                         # NEW: runs all domain seeders in order
│       └── 0001_foundation_seeder.ts              # NEW: provinces, tax, shipping, gateways, settings
├── app/
│   └── models/
│       ├── media.ts
│       ├── region.ts
│       ├── region_translation.ts
│       ├── tax_class.ts
│       ├── tax_rate.ts
│       ├── shipping_zone.ts
│       ├── shipping_zone_location.ts
│       ├── shipping_method.ts
│       ├── shipping_zone_method.ts
│       ├── payment_gateway.ts
│       └── setting.ts
└── tests/
    ├── unit/foundation/
    │   ├── settings_service.spec.ts
    │   └── shipping_zone_match.spec.ts             # specificity ranking helper
    └── functional/foundation/
        └── seeders.spec.ts                         # asserts seeder produced expected rows
```

## Routes convention

`start/routes.ts` becomes a thin orchestrator:

```ts
import router from '@adonisjs/core/services/router'

router.get('/health', async () => ({ status: 'ok' }))

await import('./routes/catalog.js')       // phase 02 (placeholder import; comment-out until phase 02 lands)
await import('./routes/auth.js')          // phase 03
await import('./routes/account.js')       // phase 03
await import('./routes/cart.js')          // phase 04
await import('./routes/checkout.js')      // phase 05
await import('./routes/account_orders.js')// phase 05
await import('./routes/admin_catalog.js') // phase 02
await import('./routes/admin_customers.js')// phase 03
await import('./routes/admin_orders.js')  // phase 05
await import('./routes/admin_coupons.js') // phase 06
await import('./routes/admin_refunds.js') // phase 07
await import('./routes/admin_notes.js')   // phase 07
await import('./routes/admin_payments.js')// phase 08
await import('./routes/payment.js')       // phase 08
```

**For this phase**: comment-out every line except `/health` (later phases uncomment as they land). Establishing the structure now eliminates merge conflicts later.

## Schema (full detail in ADR §"Schema overview")

| Table | Purpose | Notes |
|---|---|---|
| `media` | universal asset record | `kind ('image'\|'file')`, `url`, `mime`, `width`, `height`, `size_bytes`, `alt`, `attributes JSONB` |
| `regions` | country-scoped administrative regions (Pattern 1 in [09-extensibility-patterns](./09-extensibility-patterns.md)) | `(id BIGSERIAL, country_code CHAR(2), code VARCHAR(10) — ISO-3166-2 subdivision, parent_id NULLABLE self-FK, ordering, attributes JSONB)` UNIQUE `(country_code, code)`. Iran rows: code `IR-THR`, `IR-MZN`, …. |
| `region_translations` | localized region names | `(region_id, locale, name)` PK `(region_id, locale)` |
| `tax_classes` | tax category lookup | `slug UNIQUE`, `name` |
| `tax_rates` | tax rate matrix | `tax_class_id FK, country VARCHAR(2) nullable, region_id BIGINT NULLABLE FK regions, postcodes TEXT[], cities TEXT[], rate NUMERIC(7,4), label, priority SMALLINT, compound, applies_to_shipping, ordering` |
| `shipping_zones` | named zones | `name, is_fallback BOOL` (only one row may be `is_fallback=true`) |
| `shipping_zone_locations` | zone match keys | `(zone_id, type enum continent\|country\|state\|postcode, code)`. Specificity ranking: postcode=4, state=3, country=2, continent=1. |
| `shipping_methods` | method registry | `code UNIQUE, title_default, description_default, settings_schema JSONB` |
| `shipping_zone_methods` | per-zone instances | `(zone_id, method_id, title_override, enabled, ordering, settings JSONB)` |
| `payment_gateways` | gateway registry | `code UNIQUE, enabled, ordering, settings JSONB, supports JSONB` |
| `settings` | typed key-value config | `(group_key, key, value JSONB, type CHAR(16))` PK `(group_key, key)`; type = `'string'\|'number'\|'boolean'\|'json'` |

All migrations must include `created_at` / `updated_at` (`timestamp({ useTz: true })`) and `BIGSERIAL` primary keys. Use `table.bigInteger('foo_id').unsigned().references('id').inTable('foos').onDelete('restrict')` for FKs — never `onDelete('cascade')` on lookup tables (deletes should fail loudly so we notice when something's still referenced).

Foreign keys to settle in this phase:
- `region_translations.region_id` → `regions.id` ON DELETE CASCADE
- `regions.parent_id` → `regions.id` self-FK (nullable)
- `tax_rates.tax_class_id` → `tax_classes.id`
- `tax_rates.region_id` → `regions.id` (nullable)
- `shipping_zone_locations.zone_id` → `shipping_zones.id`
- `shipping_zone_methods.zone_id` → `shipping_zones.id`
- `shipping_zone_methods.method_id` → `shipping_methods.id`

## Models

One Lucid model per table; all under `app/models/`. Conventions per `apps/api/AGENTS.md`:

- Filename: `snake_case.ts`, class name: PascalCase.
- Import via `#models/*`.
- Money columns use `column({ columnName: 'rate', consume: parseFloat })` for `NUMERIC` reads; JSONB columns use `column({ prepare: (v) => JSON.stringify(v), consume: (v) => (typeof v === 'string' ? JSON.parse(v) : v) })`.
- Relationships:
  - `Region hasMany RegionTranslation, belongsTo Region (self, as 'parent')`.
  - `RegionTranslation belongsTo Region`.
  - `TaxClass hasMany TaxRate`.
  - `TaxRate belongsTo TaxClass, belongsTo Region (nullable)`.
  - `ShippingZone hasMany ShippingZoneLocation, hasMany ShippingZoneMethod`.
  - `ShippingZoneMethod belongsTo ShippingZone, belongsTo ShippingMethod`.
  - `PaymentGateway` standalone.
  - `Setting` standalone (no relations).

## Settings service

Create `app/services/settings_service.ts` exposing:

```ts
class SettingsService {
  async get<T>(group: string, key: string, fallback: T): Promise<T>
  async set(group: string, key: string, value: unknown, type: 'string' | 'number' | 'boolean' | 'json'): Promise<void>
  async all(group: string): Promise<Record<string, unknown>>
}
```

Memoize reads behind a process-local cache invalidated on `set()`. Other phases consume this for `hold_stock_minutes`, `currency_display_default`, etc.

## Seeders

`database/seeders/main_seeder.ts` looks like:

```ts
import { BaseSeeder } from '@adonisjs/lucid/seeders'
export default class MainSeeder extends BaseSeeder {
    async run() {
        await new (await import('./0001_foundation_seeder.js')).default(this.client).run()
        // later phases append their own import here
    }
}
```

`database/seeders/0001_foundation_seeder.ts` populates:

**Regions — Iran** (31 rows, `country_code='IR'`, ISO-3166-2 codes, fa + en translations + ordering). Code format: `IR-XXX`. Names (subset for reference; full list in seeder):
`IR-THR تهران/Tehran, IR-MZN مازندران/Mazandaran, IR-ISF اصفهان/Isfahan, IR-FRS فارس/Fars, IR-KHZ خوزستان/Khuzestan, IR-RAZ خراسان رضوی/Razavi Khorasan, IR-AZE آذربایجان شرقی/East Azerbaijan, IR-WAZ آذربایجان غربی/West Azerbaijan, IR-ARD اردبیل/Ardabil, IR-BUS بوشهر/Bushehr, IR-CHB چهارمحال و بختیاری/Chaharmahal & Bakhtiari, IR-SKH خراسان جنوبی/South Khorasan, IR-NKH خراسان شمالی/North Khorasan, IR-GIL گیلان/Gilan, IR-GLS گلستان/Golestan, IR-HMD همدان/Hamadan, IR-HRM هرمزگان/Hormozgan, IR-ILM ایلام/Ilam, IR-KRN کرمان/Kerman, IR-KRM کرمانشاه/Kermanshah, IR-KBD کهگیلویه و بویراحمد/Kohgiluyeh & Boyer-Ahmad, IR-KRD کردستان/Kurdistan, IR-LRS لرستان/Lorestan, IR-MAZ مرکزی/Markazi, IR-QZV قزوین/Qazvin, IR-QOM قم/Qom, IR-SMN سمنان/Semnan, IR-SBN سیستان و بلوچستان/Sistan & Baluchistan, IR-YZD یزد/Yazd, IR-ZJN زنجان/Zanjan, IR-ALB البرز/Alborz`. Use the authoritative ISO-3166-2:IR list for the final codes. Translations are written to `region_translations` (two rows per region: `locale='fa'` + `locale='en'`).

**Tax classes**: `standard` (name: "استاندارد"), `reduced-rate` (name: "نرخ کاهش‌یافته"), `zero-rate` (name: "نرخ صفر").

**Tax rates**: one row — `tax_class_id=standard, country=IR, region_id=NULL (matches any IR region), rate=10.0000, label="مالیات بر ارزش افزوده", priority=1, compound=false, applies_to_shipping=false`.

**Shipping zones**: `ایران` (`is_fallback=false`) and `سایر نقاط جهان` (`is_fallback=true`).
**Shipping zone locations**: Iran zone gets one `country=IR` row.
**Shipping methods** (registry): `flat_rate`, `free_shipping`, `local_pickup`, `post_pishtaz`, `post_sefareshi`, `tipax`. Each with a Persian `title_default`.
**Shipping zone methods**: under Iran zone seed: `post_pishtaz` (`{cost: 500000}` Rial), `post_sefareshi` (`{cost: 350000}`), `tipax` (`{cost: 800000}`), `free_shipping` (`{min_amount: 50000000}` Rial = 5,000,000 Toman).

**Payment gateways** (registry):
- `zarinpal` — `enabled: false, settings: {merchant_id: ''}, supports: {refunds: false}`
- `idpay` — `enabled: false, settings: {api_key: ''}, supports: {refunds: false}`
- `nextpay` — `enabled: false, settings: {api_key: ''}, supports: {refunds: false}`
- `payir` — `enabled: false, settings: {api_key: ''}, supports: {refunds: false}`
- `zibal` — `enabled: false, settings: {merchant_id: ''}, supports: {refunds: false}`
- `cod` (cash on delivery) — `enabled: true, settings: {}, supports: {refunds: false}`
- `bank_transfer` — `enabled: true, settings: {iban: '', account_name: ''}, supports: {refunds: false}`

**Settings**:
- `general.currency` = `"IRR"` (string)
- `general.currency_display_default` = `"IRT"` (string)
- `general.country_default` = `"IR"` (string)
- `general.locale_default` = `"fa"` (string)
- `tax.prices_include_tax` = `true` (boolean)
- `tax.display_shop` = `"incl"` (string, enum `incl`/`excl`)
- `tax.display_cart` = `"incl"` (string)
- `inventory.hold_stock_minutes` = `60` (number)
- `inventory.low_stock_threshold_default` = `2` (number)
- `orders.draft_expiry_hours` = `24` (number)
- `orders.number_format` = `"{id}"` (string, future templating)

All seeder writes use `updateOrCreate` to keep the run idempotent.

## Tests

### Unit (`tests/unit/foundation/`)

| Spec file | Cases |
|---|---|
| `settings_service.spec.ts` | (a) `get` returns fallback on missing key. (b) `set` then `get` round-trips for each type. (c) `set` invalidates the memoized cache. (d) `all(group)` returns only that group's keys. |
| `shipping_zone_match.spec.ts` | (a) Postcode match beats state match. (b) State match beats country match. (c) No location match → falls through to `is_fallback=true` zone. (d) Multiple postcode matches → ascending zone_id wins (deterministic tiebreaker). |

### Functional (`tests/functional/foundation/`)

| Spec file | Cases |
|---|---|
| `seeders.spec.ts` | (a) Iran regions count is 31; each has fa + en translation. (b) Standard tax class exists with slug `standard`. (c) Iran VAT rate exists with `country='IR'`, `rate=10`, `region_id=NULL`. (d) Both shipping zones exist; exactly one has `is_fallback=true`. (e) All 7 payment gateways exist with expected codes. (f) Critical settings exist (`general.currency`, `tax.prices_include_tax`, `inventory.hold_stock_minutes`). (g) Running the seeder twice does not duplicate rows. (h) `regions` table is country-scoped: `INSERT INTO regions (country_code='US', code='US-CA')` succeeds without a migration. |

No HTTP endpoints in this phase — testing is data + service-level.

## Definition of done

- [ ] `just db-reset && just migrate` succeeds.
- [ ] `just seed && just seed` succeeds (idempotent).
- [ ] `just test` green (all 11+ specs).
- [ ] `pnpm --filter @calibra/api typecheck` green.
- [ ] `just lint` green.
- [ ] `start/routes.ts` imports a placeholder line for every later-phase route file (commented out).
- [ ] PR body lists the 31 Iran region codes + fa/en names for visual review.
