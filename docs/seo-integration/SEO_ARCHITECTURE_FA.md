# معماری اجرایی ماژول SEO کالیبرا

## 1. اصل معماری

ماژول SEO یک App جدا نیست. یک Vertical Slice در Monorepo کالیبراست:

```text
Admin 3001
  -> /api/admin/seo/* same-origin proxy
    -> API 3333 /api/v1/admin/seo/*
      -> SeoService / SeoAnalyzer / SeoSchemaBuilder
        -> PostgreSQL tenant-scoped tables + existing commerce/content tables

Storefront
  -> public SEO API /api/v1/seo/*
    -> robots / sitemap / metadata / JSON-LD
```

## 2. Navigation

ترتیب ثابت:

```text
فاکتور
نوشته‌ها
سئو  [collapsible]
  کنترل
    نمای کلی
    مرکز فرمان
  کاتالوگ
    سئوی محصولات
    دسته‌بندی و لینک‌سازی
    تصاویر و ALT
    اسکیما و پیش‌نمایش
  محتوا
    کلمات کلیدی و محتوا
    به‌روزرسانی محتوا
    ویرایشگر زنده
    رادار بازار
  پایش
    سلامت فنی
    پایش خزش
    رهگیری رتبه
    رقبا و SERP
  سیستم
    گزارش‌ها
    تنظیمات
```

## 3. مدل داده افزودنی

### `seo_entity_profiles`

یک Profile در هر Tenant/Entity/Locale:
- entity_kind: product/category/brand/attribute/content_post/media/page
- entity_id
- locale
- meta_title/meta_description/focus_keyword/secondary_keywords
- canonical_url
- robots_index/robots_follow
- og fields و social media id
- schema_type/schema_overrides
- engine_profile: k20/k21
- score و component scores
- version برای optimistic concurrency
- timestamps و actor ids

Unique: `(tenant_id, entity_kind, entity_id, locale)`

### `seo_issues`

- profile/entity reference
- rule_code، severity، status
- title، description، evidence، suggested_fix
- first_seen_at، last_seen_at، resolved_at
- audit_run_id

Index: tenant + status + severity + entity.

### `seo_audit_runs`

- kind: full/entity/technical/crawl/schema/content/media
- status: queued/running/completed/failed/cancelled
- engine_profile
- scope، counters، result_summary، error
- actor و timestamps

### `seo_keywords`

- phrase، locale، target entity/url
- country/city/device/search_engine
- current/previous/best position nullable
- volume/difficulty nullable و source
- last_checked_at

داده رتبه فقط از import یا integration واقعی وارد می‌شود.

### `seo_competitors`

- domain، label، enabled
- metrics snapshot و last_synced_at
- source

### `seo_internal_links`

- source entity، target entity
- anchor، relation، status
- suggested/applied metadata
- unique relation key

### `seo_redirects`

- source_path، target_path nullable
- status_code: 301/302/307/308/410
- enabled، hit_count، last_hit_at

### `seo_integrations`

- provider: search_console/bing_webmaster/indexnow/merchant_center/openai_searchbot/manual_import
- status
- public configuration فقط
- credential_env_ref
- last_sync_at/last_error

هیچ secret value ذخیره نمی‌شود.

### `seo_events`

Audit trail دامنه‌ای برای analyze/apply/resolve/submit/sync/export.

## 4. API Admin

```text
GET    /api/v1/admin/seo/overview
GET    /api/v1/admin/seo/entities
GET    /api/v1/admin/seo/entities/:kind/:id
PATCH  /api/v1/admin/seo/entities/:kind/:id
POST   /api/v1/admin/seo/entities/:kind/:id/analyze

GET    /api/v1/admin/seo/issues
PATCH  /api/v1/admin/seo/issues/:id

GET    /api/v1/admin/seo/audits
POST   /api/v1/admin/seo/audits
GET    /api/v1/admin/seo/audits/:id

GET    /api/v1/admin/seo/keywords
POST   /api/v1/admin/seo/keywords
PATCH  /api/v1/admin/seo/keywords/:id
DELETE /api/v1/admin/seo/keywords/:id

GET    /api/v1/admin/seo/competitors
POST   /api/v1/admin/seo/competitors
PATCH  /api/v1/admin/seo/competitors/:id
DELETE /api/v1/admin/seo/competitors/:id

GET    /api/v1/admin/seo/internal-links
POST   /api/v1/admin/seo/internal-links
PATCH  /api/v1/admin/seo/internal-links/:id
DELETE /api/v1/admin/seo/internal-links/:id

GET    /api/v1/admin/seo/redirects
POST   /api/v1/admin/seo/redirects
PATCH  /api/v1/admin/seo/redirects/:id
DELETE /api/v1/admin/seo/redirects/:id

GET    /api/v1/admin/seo/schema/:kind/:id
GET    /api/v1/admin/seo/robots/preview
GET    /api/v1/admin/seo/sitemaps/preview
POST   /api/v1/admin/seo/indexnow/submit

GET    /api/v1/admin/seo/settings
PATCH  /api/v1/admin/seo/settings
GET    /api/v1/admin/seo/integrations
PATCH  /api/v1/admin/seo/integrations/:provider

GET    /api/v1/admin/seo/reports
GET    /api/v1/admin/seo/reports/export
```

## 5. API Public

```text
GET /api/v1/seo/robots
GET /api/v1/seo/sitemap
GET /api/v1/seo/sitemap/:kind
GET /api/v1/seo/meta/:kind/:slug
GET /api/v1/seo/schema/:kind/:slug
GET /api/v1/seo/indexnow-key
```

Public endpointها فقط داده منتشرشده، indexable و tenant/domain-resolved را برمی‌گردانند.

## 6. Analyzer

Analyzer یک موتور Pure است که Evidence دریافت می‌کند و `ScoreResult` برمی‌گرداند:

```ts
interface ScoreResult {
  total: number;
  technical: number;
  content: number;
  schema: number;
  media: number;
  commerce: number;
  issues: SeoIssueDraft[];
}
```

Ruleها code پایدار دارند، مانند:

```text
meta.title.missing
meta.title.length
meta.description.missing
slug.invalid
canonical.missing
robots.noindex.published
content.short
content.heading.missing
product.sku.missing
product.gtin.missing
product.brand.missing
product.category.missing
product.offer.incomplete
media.alt.missing
media.dimensions.missing
schema.product.ineligible
schema.article.author_missing
links.orphan
freshness.stale
```

## 7. Mapping صفحات UI به داده واقعی

- Overview: aggregate واقعی entities/issues/audits/content attribution.
- Categories & Links: category tree + product counts + internal link graph.
- Keywords & Content: `seo_keywords` + Content OS posts.
- Technical Health: issue list + robots/sitemap/canonical checks.
- Schema Preview: generated JSON-LD + validation checklist.
- Competitors & SERP: stored competitors/imported metrics؛ Empty state تا اتصال.
- Images & ALT: Media table + usage + missing ALT.
- Products: product translations/brand/category/media/price/stock/profile score.
- Rank Tracking: stored/imported rank rows؛ بدون rank ساختگی.
- Content Refresh: published posts based on modified date/score/performance.
- Control Tower: audit runs + issue queue + approval actions.
- Crawl Monitoring: audit history + sitemap status + response status imports.
- Live Editor: profile edit + SERP/social/schema preview + save/analyze.
- Market Radar: existing content signals/sources + keyword/competitor context.
- Reports: aggregate + CSV export.
- Settings: engine profile، robots، sitemap، organization، integrations.

## 8. Storefront hooks

- `robots.ts`: config را از Public SEO API می‌گیرد؛ fallback امن دارد.
- `sitemap.ts`: URLهای واقعی و canonical را تولید می‌کند؛ سقف 50,000 در هر sitemap رعایت می‌شود.
- Product detail route: Metadata و Product JSON-LD از API.
- Mag detail: Metadata و BlogPosting/Breadcrumb JSON-LD.
- Layout: Organization/WebSite JSON-LD فقط از تنظیمات واقعی.
- تصاویر: ALT از Media و Entity data؛ fallback فقط نام واقعی Entity.

## 9. امنیت و پایداری

- RLS روی تمام جدول‌ها.
- Secrets فقط Environment.
- Audit log روی Writeها.
- Rate limit روی analyze/sync/indexnow.
- Timeout و SSRF policy برای integration network calls.
- Transaction فقط برای DB changes؛ شبکه بیرون Transaction.
- Batch size و pagination برای audit.
- Stable query keys و AbortSignal در Admin.
- Error boundaries و empty states.

## 10. تست

### Static
- file inventory، forbidden names، no mock runtime، route/menu mapping، token-only UI، RLS strings، middleware و schema parity.

### Unit
- score rules برای هر entity/profile.
- robots builder.
- sitemap filtering/chunking.
- JSON-LD builder.
- canonical/slug/title/description normalization.
- update/version conflict.

### Functional API
- tenant isolation.
- auth/admin/write limiter.
- CRUD profile/keyword/competitor/link/redirect.
- audit and issue lifecycle.
- public endpoint excludes draft/noindex/private.

### Admin/E2E
- ۱۶ route.
- Sidebar order/collapse/active state.
- loading/error/empty.
- entity selection/live editor/save/analyze.
- robots/sitemap/schema preview.

### Regression
- existing factor verifier.
- existing content verifier.
- root typecheck/build/lint.
