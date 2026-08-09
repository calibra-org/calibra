# پرامپت مادر یکپارچه‌سازی SEO در Calibra

## نقش و مسئولیت

به‌عنوان Principal Engineer، Software Architect، Senior Backend Engineer، Senior Frontend Engineer، Product Designer، UX Researcher، Technical SEO Architect، Data Engineer، Security Reviewer و QA Lead روی Monorepo کالیبرا عمل کن. تصمیم نهایی با ناظر اصلی است. بررسی‌ها می‌توانند در مسیرهای خواندنی موازی انجام شوند، اما هر تغییری در فایل‌های مشترک، مدل داده، Sidebar، ترجمه‌ها، توکن‌ها و Routeهای مرکزی باید به‌صورت سریال، قابل بازبینی و برگشت‌پذیر اعمال شود.

## مأموریت

UI کامل ۱۶ صفحه‌ای SEO موجود را از یک Prototype مبتنی بر Mock Data به یک ماژول واقعی، Tenant-aware و Production-grade در Calibra تبدیل کن؛ بدون ورود نام «Lolit» یا «کشاورز بیست» به منو یا رابط Admin و بدون حذف یا بازنویسی قابلیت‌های موجود فاکتور، نوشته‌ها، محصولات، سفارش‌ها، رسانه و Storefront.

## مبنای فنی غیرقابل تغییر

- Monorepo: pnpm + Turbo.
- Admin: Next.js 16 App Router، React، TypeScript، Tailwind v4، next-intl، TanStack Query، panel-kit/shadcn، پورت 3001.
- API: AdonisJS 7، Lucid/PostgreSQL، VineJS، Japa، RLS مبتنی بر Tenant، پورت 3333.
- Storefront: Next.js 16 App Router، Tailwind v4، next-intl.
- فارسی زبان پیش‌فرض و RTL واقعی؛ انگلیسی زبان دوم.
- فونت فارسی Vazirmatn و فونت انگلیسی Inter از Layout فعلی؛ هیچ فونت جدیدی اضافه نشود.
- هیچ Dependency جدیدی بدون تأیید صریح کاربر اضافه نشود.
- تمام UI Admin فقط از Semantic Tokenهای کالیبرا استفاده کند؛ هیچ رنگ Hex، پالت مستقل یا کلاس hardcoded مربوط به Prototype قبلی وارد نشود.
- مرورگر فقط به Same-origin Admin Proxy درخواست بزند؛ Bearer token در Client قرار نگیرد.
- تمام Mutationها CSRF، Validation، Audit Log، Rate Limit و Tenant isolation را رعایت کنند.
- پول فقط با قرارداد minor unit فعلی کالیبرا پردازش شود.

## قیود قطعی محصول

1. منوی فعلی «فاکتور» بدون حذف و تغییر باقی بماند.
2. منوی فعلی «نوشته‌ها» مستقیماً زیر فاکتور حفظ شود.
3. منوی باز و بسته‌شونده «سئو» مستقیماً زیر نوشته‌ها اضافه شود.
4. همه ۱۶ صفحه SEO در Admin پورت 3001 قرار گیرند.
5. منوی SEO به گروه‌های کوچک خوانا تقسیم شود، ولی همه صفحه‌ها قابل دسترس باشند.
6. هیچ‌کدام از نام‌های ممنوع در Navigation، Page title، Toast، Empty state، API response label یا تنظیمات نمایشی دیده نشوند.
7. K20 و K21 به‌عنوان Profileهای داخلی موتور تحلیل پشتیبانی شوند؛ نام نمایشی آن‌ها «استاندارد K20» و «پیشرفته K21» باشد.
8. داده ساختگی تولید نشود. هرجا اتصال خارجی یا داده رتبه وجود ندارد، UI باید صریحاً حالت «اتصال برقرار نیست» یا «داده‌ای ثبت نشده» نشان دهد.
9. Schema فقط از داده‌ای تولید شود که واقعاً در صفحه و دیتابیس وجود دارد؛ هیچ Review، Rating، Price، Stock، GTIN، Author، Date یا Claim ساخته نشود.
10. robots.txt برای جلوگیری از Index شدن صفحه استفاده نشود؛ noindex در سطح Entity/Profile مدیریت شود.
11. Sitemap فقط Canonical URLهای Public، Published و Indexable را شامل شود.
12. هر تغییر قابل اعمال توسط SEO باید Preview، Human approval، Audit trail و Rollback-safe payload داشته باشد.

## صفحات اجباری

1. `/seo/overview` — نمای کلی و سلامت کل SEO
2. `/seo/categories-links` — دسته‌بندی‌ها و لینک‌سازی داخلی
3. `/seo/keywords-content` — کلمات کلیدی و محتوا
4. `/seo/technical-health` — سلامت فنی و خطاها
5. `/seo/schema-preview` — اسکیما و Rich Result preview
6. `/seo/competitors-serp` — رقبا و SERP
7. `/seo/images-alt` — تصاویر، ALT و کیفیت رسانه
8. `/seo/products` — کنترل SEO محصولات
9. `/seo/rank-tracking` — رهگیری رتبه
10. `/seo/content-refresh` — به‌روزرسانی محتوای قدیمی
11. `/seo/control-tower` — مرکز فرمان و صف اقدامات
12. `/seo/crawl-monitoring` — پایش Crawl و Sitemap
13. `/seo/live-editor` — ویرایشگر زنده Metadata و Preview
14. `/seo/market-radar` — رادار بازار و اتصال به Content OS
15. `/seo/reports` — گزارش‌ها، روند و Export
16. `/seo/settings` — تنظیمات سایت، robots، sitemap، schema و Integrationها

## موجودیت‌های متصل

- Product و ProductTranslation
- ProductCategory و Translation
- ProductBrand و Translation
- ProductAttribute و Termها
- ContentPost، Taxonomy، Revision، Attribution و Agent run
- Media و ALT/Caption/Dimensions/MIME
- Order فقط برای Attribution و Revenue analysis؛ Order نباید Indexable entity شود.
- Storefront page، Site settings و Tenant domain

## استانداردهای موتور تحلیل

### K20

Profile محافظه‌کار و عملیاتی برای سلامت پایه:
- Title، Description، Slug، Canonical، Robots
- Content completeness
- Image ALT
- Product identity: SKU/GTIN/Brand/Category
- Sitemap inclusion
- Schema parity
- Internal link presence
- Publication state و HTTP eligibility

### K21

Profile پیشرفته علاوه بر K20:
- ProductGroup/Variant readiness
- Knowledge graph relationships
- Compatibility/accessory/consumable relations
- Content freshness و evidence coverage
- Entity consistency across page/schema/feed/API
- AI crawler accessibility و citation readiness
- Merchant listing readiness
- IndexNow readiness
- Author/reviewer/editorial governance
- Link opportunity and orphan detection

## کیفیت UI/UX

- PageHeader فعلی کالیبرا استفاده شود.
- Card، Badge، Table، Dialog، Sheet، Tabs، Input، Select، Switch، Progress، EmptyState و Toast فقط از Primitiveهای فعلی Admin استفاده شوند.
- اندازه متن، radius، spacing و density مطابق صفحات Products/Content/Factor باشد.
- همه spacingها منطقی (`ms`, `me`, `ps`, `pe`) و RTL-safe باشند.
- جدول‌ها در عرض کم Scroll کنترل‌شده داشته باشند و هیچ overflow افقی در Page shell ایجاد نکنند.
- Iconها فقط از registry موجود `#/icons` وارد شوند.
- Loading، Empty، Error، Unauthorized، Not-configured و Partial-data state برای تمام صفحات وجود داشته باشد.
- Keyboard navigation، Focus ring، aria-label و Dialog semantics رعایت شود.
- هیچ Action نمایشی یا دکمه بی‌اثر باقی نماند.

## کیفیت Backend

- Migration کاملاً additive و دارای down باشد.
- همه جدول‌های SEO دارای `tenant_id`، Default از GUC، RLS enable/force و policy یکسان با Calibra باشند.
- Static routes قبل از dynamic routes ثبت شوند.
- Controller فقط Validation/HTTP orchestration؛ منطق در Service/Domain باشد.
- Queryهای سنگین Pagination، Limit و Index مناسب داشته باشند.
- External HTTP call داخل Transaction دیتابیس انجام نشود.
- Secrets داخل DB یا ZIP ذخیره نشوند؛ فقط Environment reference و وضعیت اتصال ذخیره شود.
- Fetchهای خارجی دارای timeout، allowlist/host validation، redirect limit و SSRF protection موجود پروژه باشند.
- هر Mutation در `admin_audit_log` ثبت شود.
- Optimistic concurrency برای Profile و Settings اعمال شود.

## خروجی Public SEO

- Dynamic robots بر اساس تنظیمات Tenant و Domain.
- Dynamic sitemap برای صفحات، محصولات، دسته‌ها، برندها، نوشته‌ها و تصاویر، فقط در صورت وجود Route عمومی.
- Product JSON-LD با Product/Offer و ProductGroup فقط در صورت وجود داده واقعی.
- BlogPosting/Article JSON-LD برای نوشته‌ها.
- BreadcrumbList و Organization/WebSite در صفحات مربوط.
- Canonical، alternate locale، Open Graph، Twitter card و robots metadata از SEO Profile و fallback واقعی Entity.
- IndexNow submission برای URLهای Add/Update/Delete، فقط در صورت Environment key معتبر.
- OAI-SearchBot policy در robots قابل تنظیم باشد و پیش‌فرض آن block نباشد.

## فرآیند اجرا

1. Baseline hash و inventory همه فایل‌های مشترک ثبت شود.
2. UI prototype به Capability matrix تبدیل شود؛ هیچ Mock Data منتقل نشود.
3. Migration و Domain types ساخته شود.
4. Analyzerهای Pure و تست‌پذیر ساخته شوند.
5. API Admin و Public ساخته شود.
6. Admin query layer و ۱۶ صفحه ساخته شود.
7. Sidebar و i18n با کمترین Diff تغییر کند.
8. Storefront metadata/robots/sitemap/schema اضافه شود.
9. Static verifier و unit/functional/e2e tests نوشته شود.
10. Biome، token lint، typecheck، targeted tests، build و smoke test اجرا شود.
11. Package installer/rollback/checksum/manifest ساخته شود.
12. فقط پس از PASS شدن Gateها ZIP تحویل شود.

## Gateهای پذیرش

- هیچ فایل موجود خارج از فهرست مجاز تغییر نکند.
- هیچ نام ممنوع در UI و ترجمه‌ها نباشد.
- هیچ Mock marker در Runtime code نباشد.
- همه ۱۶ Route Admin وجود داشته باشند و Menu link صحیح داشته باشند.
- تمام API routeها Auth/Admin middleware و write limiter مناسب داشته باشند.
- تمام جدول‌های SEO RLS داشته باشند.
- robots/sitemap/schema خروجی معتبر و deterministic بدهند.
- Schema با Visible data هم‌خوان باشد.
- Existing Factor و Content verifier همچنان PASS باشند.
- Admin token lint PASS باشد.
- Typecheck و Build هر سه App PASS باشد، یا هر محدودیت محیطی با خروجی دقیق و بدون ادعای ساختگی گزارش شود.
- تعداد تست‌های اجراشده و تألیف‌شده جداگانه و دقیق گزارش شود.

## ممنوعیت‌ها

- حذف یا تغییر نام Route موجود
- تغییر مستقل Design system
- اضافه‌کردن Dependency بدون اجازه
- Secret hardcode
- fake metrics، fake rank، fake Search Console data
- تغییر Assertion برای سبزکردن تست
- خاموش‌کردن lint/typecheck
- `any` غیرضروری، silent catch، swallowed error
- اجرای network call در DB transaction
- Commit/Push خودکار در بسته تحویلی
