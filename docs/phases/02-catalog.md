# Phase 02 — Catalog

> Products, variations, attributes, categories, tags, brands, images, reviews, inventory. Storefront read endpoints + admin write endpoints. The largest single phase by table count.

**Branch:** `phase/02-catalog`
**Prerequisites:** phase-01 (uses `media`, `tax_classes`, `shipping_methods` registry)
**Parallel with:** phase-03-customers-auth
**Migration timestamp block:** `1747200000000`–`1747299999999`
**Estimated scope:** ~24 migrations, ~22 models, ~12 endpoints (storefront) + ~15 (admin), ~40 tests.

## Goal

Stand up the entire catalog read + write surface. After this PR:

- Storefront can list/filter products, view a single product (with variations + attributes), browse categories/tags/brands, post + view reviews.
- Admin can CRUD products, variations, attributes + terms, categories, tags, brands, shipping classes, reviews.
- Inventory ledger + reservation primitives exist (consumed in phase 05).
- A demo seeder populates ~50 realistic Persian products across 8 categories for storefront development.

## Files this phase owns

```
apps/api/
├── start/routes/
│   ├── catalog.ts                                  # storefront read endpoints
│   └── admin_catalog.ts                            # admin write endpoints
├── database/
│   ├── migrations/                                 # 24 files, see Schema below
│   └── seeders/
│       └── 0002_catalog_demo_seeder.ts             # ~50 products, idempotent
├── app/
│   ├── models/
│   │   ├── product.ts
│   │   ├── product_translation.ts
│   │   ├── product_variation.ts
│   │   ├── product_variation_translation.ts
│   │   ├── inventory_item.ts
│   │   ├── inventory_movement.ts
│   │   ├── product_attribute.ts
│   │   ├── product_attribute_translation.ts
│   │   ├── product_attribute_term.ts
│   │   ├── product_attribute_term_translation.ts
│   │   ├── product_attribute_link.ts
│   │   ├── product_variation_attribute.ts
│   │   ├── product_category.ts
│   │   ├── product_category_translation.ts
│   │   ├── product_tag.ts
│   │   ├── product_tag_translation.ts
│   │   ├── product_brand.ts
│   │   ├── product_brand_translation.ts
│   │   ├── product_shipping_class.ts
│   │   ├── product_shipping_class_translation.ts
│   │   ├── product_image.ts
│   │   ├── product_review.ts
│   │   ├── product_cross_sell.ts
│   │   ├── product_upsell.ts
│   │   ├── product_group_member.ts
│   │   └── product_download.ts
│   ├── controllers/
│   │   ├── catalog/
│   │   │   ├── products_controller.ts             # GET list/show
│   │   │   ├── categories_controller.ts           # GET list/show
│   │   │   ├── tags_controller.ts                 # GET list
│   │   │   ├── brands_controller.ts               # GET list
│   │   │   ├── attributes_controller.ts           # GET list, GET terms
│   │   │   └── reviews_controller.ts              # GET list, POST create
│   │   └── admin/catalog/
│   │       ├── products_controller.ts             # full CRUD + duplicate + batch
│   │       ├── variations_controller.ts           # full CRUD + batch
│   │       ├── attributes_controller.ts           # full CRUD + batch
│   │       ├── attribute_terms_controller.ts      # full CRUD + batch
│   │       ├── categories_controller.ts           # full CRUD + batch
│   │       ├── tags_controller.ts                 # full CRUD + batch
│   │       ├── brands_controller.ts               # full CRUD + batch
│   │       ├── shipping_classes_controller.ts     # full CRUD + batch
│   │       └── reviews_controller.ts              # list + moderate (status update)
│   ├── validators/
│   │   └── catalog/                               # one VineJS schema file per resource
│   └── services/
│       ├── slug_service.ts                        # Persian-aware slugification
│       └── inventory_service.ts                   # reserve / release / decrement primitives
└── tests/
    ├── unit/catalog/
    │   ├── slug_service.spec.ts
    │   ├── inventory_service.spec.ts
    │   └── price_resolver.spec.ts                 # sale-window logic
    └── functional/catalog/
        ├── products_list.spec.ts
        ├── products_show.spec.ts
        ├── products_filter.spec.ts
        ├── admin_products_crud.spec.ts
        ├── admin_variations_crud.spec.ts
        ├── attributes_crud.spec.ts
        ├── categories_tree.spec.ts
        ├── reviews_submit.spec.ts
        └── seeders_demo.spec.ts
```

## Schema (ADR §"Catalog domain")

Migrations land in this order (avoid forward references):

1. `media` — already in phase-01; not re-created
2. `product_categories` (self-FK on `parent_id`) + `product_category_translations`
3. `product_tags` + `product_tag_translations`
4. `product_brands` + `product_brand_translations`
5. `product_shipping_classes` + `product_shipping_class_translations`
6. `product_attributes` + `product_attribute_translations`
7. `product_attribute_terms` + `product_attribute_term_translations`
8. `products` + `product_translations`
9. `product_variations` + `product_variation_translations`
10. `product_images` (FK product + media; UNIQUE `(product_id, position)`)
11. `inventory_items` (FK product + variation + nullable location; UNIQUE `(product_id, variation_id, location_id)`)
12. `inventory_movements` (append-only ledger)
13. `product_attribute_links` + `product_attribute_link_terms`
14. `product_variation_attributes`
15. `product_category_links` (PK composite)
16. `product_tag_links` (PK composite)
17. `product_brand_links` (PK composite)
18. `product_cross_sells` + `product_upsells` (each: `(product_id, related_product_id)` PK composite)
19. `product_groups` + `product_group_members`
20. `product_downloads`
21. `product_reviews`

Per ADR money handling: every monetary column (`regular_price`, `sale_price`) is `BIGINT` Rial minor units. Every translatable text lives in the matching `*_translations` table with PK `(parent_id, locale)`.

## Endpoints

### Storefront (`start/routes/catalog.ts`, prefix `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/products` | List + filter. Query params per ADR (status, type, category, tag, brand, attribute, attribute_term, on_sale, min_price, max_price, stock_status, featured, search, orderby, order, page, per_page). |
| `GET` | `/products/:slug` | Single product by **localized slug** — joins `product_translations` where `locale = ctx.i18n.locale()`. Includes variations + attributes + images. |
| `GET` | `/products/:id/variations` | List variations for a product. |
| `GET` | `/categories` | Flat or tree (query `?tree=1`). |
| `GET` | `/categories/:slug` | Single category with products. |
| `GET` | `/tags` | List. |
| `GET` | `/brands` | List. |
| `GET` | `/attributes` | List attributes. |
| `GET` | `/attributes/:id/terms` | List terms. |
| `GET` | `/products/:id/reviews` | List approved reviews. |
| `POST` | `/products/:id/reviews` | Submit review (auth optional). New reviews land as `pending`. |

### Admin (`start/routes/admin_catalog.ts`, prefix `/api/v1/admin`)

Full CRUD for products, variations (nested under product), attributes (with nested terms), categories, tags, brands, shipping classes, reviews (with moderation status update).

Each resource:
- `GET /resource` — list + filter
- `POST /resource` — create
- `GET /resource/:id` — single
- `PUT /resource/:id` — replace
- `PATCH /resource/:id` — partial
- `DELETE /resource/:id` — soft-delete via `deleted_at` (per ADR D11 family — products are recoverable)
- `POST /resource/batch` — `{create: [...], update: [...], delete: [...]}`

Plus: `POST /admin/products/:id/duplicate`.

All admin routes go through an `admin` middleware (placeholder for phase 03; for now allow any authenticated request — phase 03 wires the role guard).

## Validators

`VineJS` schemas under `app/validators/catalog/`. One file per resource (e.g. `product_validator.ts`). Pattern from `apps/api/AGENTS.md`: small validators inline in controllers; extract to a file once non-trivial.

Validation rules (highlights — see ADR for exhaustive field list):

- `product.create`: `type ∈ enum`, `sku` optional but unique-when-present (case-insensitive), `regular_price` non-negative BIGINT, `sale_price ≤ regular_price` if both set, `sale_starts_at < sale_ends_at` if both set, `translations` array — must contain at least one row matching the request locale, each translation row has `name` required + `slug` unique-per-locale.
- `variation.create`: `product_id` must reference a `type=variable` product, `attribute_pins` matches `used_for_variation=true` attribute links.
- `review.create`: `rating ∈ 1..5`, `body` 10–5000 chars, `reviewer_email` valid email (or auth'd user's email auto-injected).

## Services

### `slug_service.ts`
```ts
export function slugify(input: string, locale: 'fa' | 'en'): string
```
- For `en`: standard `lodash.kebabCase`-style: lowercase ASCII, `[a-z0-9-]`, collapse separators.
- For `fa`: preserve Persian letters (`ا-ی`), replace whitespace + punctuation with `-`, percent-encode-safe; reject the empty result.
- Test: a few golden cases each locale; ensure no `pa_` style prefix is ever generated.

### `inventory_service.ts`
```ts
class InventoryService {
  async reserve(productId, variationId, quantity, ref: { kind, id })
  async release(productId, variationId, quantity, ref)
  async decrement(productId, variationId, quantity, ref)   // sale
  async increment(productId, variationId, quantity, ref)   // restock / refund
  async snapshot(productId, variationId): Promise<{ stock, status }>
}
```
- Each call appends a row to `inventory_movements` AND updates `inventory_items.stock_quantity` in the same transaction with `SELECT … FOR UPDATE`.
- Respects `manage_stock=false` (no-op).
- Respects `backorders='no'` and refuses to decrement below 0 in that case.

## Seeder

`0002_catalog_demo_seeder.ts` — toggleable via `--demo` env var or `NODE_ENV !== 'production'`. Idempotent via `updateOrCreate` keyed on `(slug, locale)` for translations.

Demo data sketch (just enough to populate a storefront):

- 8 categories: پوشاک، الکترونیک، خانه و آشپزخانه، زیبایی و سلامت، کتاب، ورزش و سفر، کودک و نوزاد، خودرو
- 30 attribute terms across 4 attributes:
  - رنگ (color): مشکی، سفید، قرمز، آبی، سبز، طوسی، طلایی، صورتی، قهوه‌ای، بنفش
  - سایز (size): S, M, L, XL, XXL
  - متریال (material): پنبه، چرم، فلز، چوب، پلاستیک، شیشه، سرامیک
  - وزن (weight): سبک، متوسط، سنگین
- 5 brands: کلیربا, آذرنوش, پارسیان, کاوه, زاگرس (placeholder agency brands).
- ~50 products across the categories, mix of `simple` (35) and `variable` (15). Variable products get 2–4 variations.
- Images via `https://picsum.photos/seed/<slug>/600/600` URLs (no actual storage in dev).
- Realistic Rial prices (e.g. 5,000,000 – 50,000,000 IRR).

Seeder logs: print created count and skipped count for visibility.

## Tests

### Unit (`tests/unit/catalog/`)

| Spec | Cases |
|---|---|
| `slug_service.spec.ts` | (a) fa: "گوشی موبایل سامسونگ" → `گوشی-موبایل-سامسونگ`. (b) en: "iPhone 15 Pro Max" → `iphone-15-pro-max`. (c) Empty input throws. (d) Symbols collapsed. (e) Leading/trailing dashes stripped. (f) Never produces `pa_` prefix. |
| `inventory_service.spec.ts` | (a) `reserve` appends ledger + decrements stock. (b) `release` reverses. (c) `decrement` past zero with `backorders='no'` throws. (d) `decrement` past zero with `backorders='yes'` succeeds. (e) Concurrent `reserve` on same row serializes (no double-spend). (f) `manage_stock=false` no-ops. |
| `price_resolver.spec.ts` | (a) No sale → returns `regular_price`. (b) Sale active (within window) → returns `sale_price`. (c) Sale outside window → returns `regular_price`. (d) Variation overrides product price. |

### Functional (`tests/functional/catalog/`)

| Spec | Cases |
|---|---|
| `products_list.spec.ts` | (a) Returns paginated envelope. (b) Default sort = `menu_order`. (c) Locale resolution returns fa name when `Accept-Language: fa`. (d) Filters: `?category=…`, `?tag=…`, `?brand=…`, `?attribute=size&attribute_term=L`, `?on_sale=1`, `?min_price=…&max_price=…`, `?stock_status=instock`. (e) `?search=foo` matches across translations. |
| `products_show.spec.ts` | (a) GET by localized slug returns product with variations + images + attributes. (b) Wrong-locale slug → 404. (c) `deleted_at` set → 404. |
| `products_filter.spec.ts` | Combinatorial: 6 filter combinations, assert correct rows. |
| `admin_products_crud.spec.ts` | (a) Create with all required fields. (b) Update single field via PATCH. (c) Soft delete sets `deleted_at`. (d) Duplicate copies translations + images. (e) Batch endpoint applies all three actions atomically. |
| `admin_variations_crud.spec.ts` | (a) Create variation requires parent `type=variable`. (b) Attribute pins must reference attributes with `used_for_variation=true`. (c) Variation inherits parent stock when `manage_stock_mode='parent'`. |
| `attributes_crud.spec.ts` | (a) Slug never gets `pa_` prefix. (b) Term creation under attribute. (c) Deleting attribute with linked products fails (FK restrict). |
| `categories_tree.spec.ts` | (a) `?tree=1` returns nested children. (b) `parent_id=null` filter returns roots. (c) Translated names per locale. |
| `reviews_submit.spec.ts` | (a) Anonymous submit lands as `pending`. (b) Authenticated submit lands as `pending`, `customer_id` set. (c) Public list omits non-`approved`. (d) Rating outside 1–5 → 422. |
| `seeders_demo.spec.ts` | (a) After seeder, products count ≥ 50. (b) All 8 categories present. (c) Every product has at least one image. (d) Variable products have ≥ 2 variations. (e) Re-running the seeder doesn't duplicate. |

## Definition of done

- [ ] All 21+ migrations apply cleanly on a fresh DB.
- [ ] `just seed` produces demo catalog idempotently.
- [ ] All listed unit + functional tests pass.
- [ ] PR body includes example cURLs:
  - `GET /api/v1/products?category=الکترونیک&on_sale=1` (with `Accept-Language: fa`)
  - `GET /api/v1/products/گوشی-موبایل-سامسونگ`
  - `POST /api/v1/admin/products` with full body
- [ ] No `pa_` prefix anywhere in generated slugs (grep the test data).
- [ ] `start/routes.ts` uncomments the two catalog imports.
