import type { SeoEngineProfile, SeoEvidence, SeoIssueDraft, SeoScoreResult } from "#services/seo/domain";

const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
const plainText = (value: string | null | undefined) => normalize(value?.replace(/<[^>]*>/g, " "));
const wordCount = (value: string | null | undefined) => plainText(value).split(/\s+/).filter(Boolean).length;
const bounded = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

interface IssueInput extends Omit<SeoIssueDraft, "evidence" | "suggestedFix"> {
    evidence?: Record<string, unknown>;
    suggestedFix?: Record<string, unknown>;
}

function issue(input: IssueInput): SeoIssueDraft {
    return { evidence: {}, suggestedFix: {}, ...input };
}

function titleValue(evidence: SeoEvidence): string {
    return normalize(evidence.profile?.metaTitle) || normalize(evidence.title);
}

function descriptionValue(evidence: SeoEvidence): string {
    return (
        normalize(evidence.profile?.metaDescription) ||
        normalize(evidence.shortDescription) ||
        plainText(evidence.description).slice(0, 500)
    );
}

function baseRules(evidence: SeoEvidence): SeoIssueDraft[] {
    const issues: SeoIssueDraft[] = [];
    const title = titleValue(evidence);
    const description = descriptionValue(evidence);
    const slug = normalize(evidence.slug);
    const canonical = normalize(evidence.profile?.canonicalUrl) || normalize(evidence.publicUrl);

    if (!title) {
        issues.push(
            issue({
                ruleCode: "meta.title.missing",
                severity: "critical",
                component: "technical",
                penalty: 25,
                title: "عنوان سئو ثبت نشده است",
                description: "برای این موجودیت عنوان صفحه یا عنوان سئو قابل استفاده وجود ندارد.",
                suggestedFix: { field: "meta_title" },
            }),
        );
    } else if (title.length < 20 || title.length > 65) {
        issues.push(
            issue({
                ruleCode: "meta.title.length",
                severity: "warning",
                component: "content",
                penalty: 8,
                title: "طول عنوان سئو مناسب نیست",
                description: "عنوان سئو بهتر است روشن، منحصربه‌فرد و در بازه عملیاتی ۲۰ تا ۶۵ نویسه باشد.",
                evidence: { length: title.length },
                suggestedFix: { min: 20, max: 65 },
            }),
        );
    }

    if (!description) {
        issues.push(
            issue({
                ruleCode: "meta.description.missing",
                severity: "warning",
                component: "content",
                penalty: 14,
                title: "توضیحات متا ثبت نشده است",
                description: "توضیح متای اختصاصی یا توضیح قابل استفاده برای این موجودیت وجود ندارد.",
                suggestedFix: { field: "meta_description" },
            }),
        );
    } else if (description.length < 70 || description.length > 180) {
        issues.push(
            issue({
                ruleCode: "meta.description.length",
                severity: "info",
                component: "content",
                penalty: 5,
                title: "طول توضیحات متا نیازمند بازبینی است",
                description: "توضیح متا باید خلاصه و متناسب با نیت صفحه باشد.",
                evidence: { length: description.length },
                suggestedFix: { min: 70, max: 180 },
            }),
        );
    }

    if (!slug && evidence.kind !== "media") {
        issues.push(
            issue({
                ruleCode: "slug.missing",
                severity: "critical",
                component: "technical",
                penalty: 18,
                title: "Slug موجود نیست",
                description: "مسیر عمومی پایدار برای این موجودیت پیدا نشد.",
                suggestedFix: { field: "slug" },
            }),
        );
    } else if (slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 191)) {
        issues.push(
            issue({
                ruleCode: "slug.invalid",
                severity: "warning",
                component: "technical",
                penalty: 8,
                title: "ساختار Slug استاندارد نیست",
                description: "Slug باید کوتاه، پایدار و شامل حروف لاتین کوچک، عدد و خط تیره باشد.",
                evidence: { slug },
                suggestedFix: { format: "lowercase-hyphenated" },
            }),
        );
    }

    if (!canonical && evidence.kind !== "media") {
        issues.push(
            issue({
                ruleCode: "canonical.missing",
                severity: "warning",
                component: "technical",
                penalty: 10,
                title: "Canonical قابل محاسبه نیست",
                description: "برای جلوگیری از ابهام URL، آدرس Canonical باید از Route عمومی یا Profile مشخص شود.",
                suggestedFix: { field: "canonical_url" },
            }),
        );
    }

    if (evidence.status === "publish" || evidence.status === "published") {
        if (evidence.profile?.robotsIndex === false) {
            issues.push(
                issue({
                    ruleCode: "robots.noindex.published",
                    severity: "warning",
                    component: "technical",
                    penalty: 15,
                    title: "موجودیت منتشرشده noindex است",
                    description: "این موجودیت منتشرشده از Index خارج شده است؛ تصمیم را بازبینی کنید.",
                    evidence: { status: evidence.status },
                    suggestedFix: { robots_index: true },
                }),
            );
        }
    }

    return issues;
}

function productRules(evidence: SeoEvidence, profile: SeoEngineProfile): SeoIssueDraft[] {
    if (evidence.kind !== "product") return [];
    const issues: SeoIssueDraft[] = [];
    const bodyWords = wordCount(`${evidence.shortDescription ?? ""} ${evidence.description ?? ""}`);
    if (!normalize(evidence.sku))
        issues.push(
            issue({
                ruleCode: "product.sku.missing",
                severity: "warning",
                component: "commerce",
                penalty: 8,
                title: "SKU ثبت نشده است",
                description: "شناسه SKU برای مدیریت Feed و همسان‌سازی محصول ضروری است.",
                suggestedFix: { field: "sku" },
            }),
        );
    if (profile === "k21" && !normalize(evidence.gtin))
        issues.push(
            issue({
                ruleCode: "product.gtin.missing",
                severity: "warning",
                component: "commerce",
                penalty: 6,
                title: "GTIN ثبت نشده است",
                description: "در Profile پیشرفته، GTIN برای هویت محصول و Merchant readiness بررسی می‌شود.",
                suggestedFix: { field: "gtin" },
            }),
        );
    if ((evidence.brandCount ?? 0) < 1)
        issues.push(
            issue({
                ruleCode: "product.brand.missing",
                severity: "warning",
                component: "commerce",
                penalty: 8,
                title: "برند محصول مشخص نیست",
                description: "حداقل یک برند واقعی برای محصول انتخاب کنید.",
                suggestedFix: { relation: "brand" },
            }),
        );
    if ((evidence.categoryCount ?? 0) < 1)
        issues.push(
            issue({
                ruleCode: "product.category.missing",
                severity: "critical",
                component: "commerce",
                penalty: 12,
                title: "دسته‌بندی محصول مشخص نیست",
                description: "محصول بدون دسته در ساختار ناوبری و Sitemap ضعیف می‌شود.",
                suggestedFix: { relation: "category" },
            }),
        );
    if ((evidence.imageCount ?? 0) < 1)
        issues.push(
            issue({
                ruleCode: "media.image.missing",
                severity: "critical",
                component: "media",
                penalty: 16,
                title: "محصول تصویر ندارد",
                description: "حداقل یک تصویر واقعی برای محصول لازم است.",
                suggestedFix: { relation: "image" },
            }),
        );
    if ((evidence.imageCount ?? 0) > (evidence.imageAltCount ?? 0))
        issues.push(
            issue({
                ruleCode: "media.alt.missing",
                severity: "warning",
                component: "media",
                penalty: 10,
                title: "بعضی تصاویر ALT ندارند",
                description: "برای تصاویر محصول متن جایگزین دقیق و غیرتکراری ثبت کنید.",
                evidence: { image_count: evidence.imageCount ?? 0, alt_count: evidence.imageAltCount ?? 0 },
                suggestedFix: { field: "media.alt" },
            }),
        );
    if (bodyWords < 80)
        issues.push(
            issue({
                ruleCode: "content.short",
                severity: "warning",
                component: "content",
                penalty: 12,
                title: "محتوای محصول کوتاه است",
                description: "توضیحات قابل مشاهده محصول اطلاعات کافی برای تصمیم خرید و درک موتور جست‌وجو ندارد.",
                evidence: { word_count: bodyWords },
                suggestedFix: { minimum_words: 80 },
            }),
        );
    if (evidence.priceMinor === null || evidence.priceMinor === undefined)
        issues.push(
            issue({
                ruleCode: "product.offer.incomplete",
                severity: "warning",
                component: "schema",
                penalty: 10,
                title: "Offer کامل نیست",
                description: "بدون قیمت واقعی، Product/Offer برای Merchant listing کامل نیست.",
                suggestedFix: { field: "price" },
            }),
        );
    if (evidence.variationCount && evidence.variationCount > 0 && profile === "k21" && (evidence.attributeCount ?? 0) < 1)
        issues.push(
            issue({
                ruleCode: "product.variants.attributes_missing",
                severity: "warning",
                component: "schema",
                penalty: 8,
                title: "ابعاد تنوع محصول مشخص نیست",
                description: "محصول متغیر باید ویژگی‌های متمایزکننده قابل مشاهده و قابل نگاشت به ProductGroup داشته باشد.",
                suggestedFix: { relation: "attributes" },
            }),
        );
    return issues;
}

function taxonomyRules(evidence: SeoEvidence): SeoIssueDraft[] {
    if (!["category", "brand", "attribute"].includes(evidence.kind)) return [];
    const issues: SeoIssueDraft[] = [];
    if (["category", "brand"].includes(evidence.kind) && wordCount(evidence.description) < 25)
        issues.push(
            issue({
                ruleCode: "taxonomy.description.short",
                severity: "warning",
                component: "content",
                penalty: 12,
                title: "توضیح Taxonomy کافی نیست",
                description: "برای صفحه دسته یا برند، توضیح منحصربه‌فرد و کاربردی ثبت کنید.",
                evidence: { word_count: wordCount(evidence.description) },
                suggestedFix: { minimum_words: 25 },
            }),
        );
    if ((evidence.productCount ?? 0) < 1 && evidence.kind !== "attribute")
        issues.push(
            issue({
                ruleCode: "taxonomy.empty",
                severity: "warning",
                component: "technical",
                penalty: 14,
                title: "صفحه Taxonomy خالی است",
                description: "صفحه بدون محصول معمولاً نباید در Sitemap قرار گیرد تا زمانی که محتوای مفید داشته باشد.",
                evidence: { product_count: evidence.productCount ?? 0 },
                suggestedFix: { robots_index: false },
            }),
        );
    if (evidence.kind === "attribute" && (evidence.termCount ?? 0) < 1)
        issues.push(
            issue({
                ruleCode: "attribute.terms.missing",
                severity: "warning",
                component: "commerce",
                penalty: 12,
                title: "ویژگی مقدار ندارد",
                description: "ویژگی بدون Term قابل استفاده در فیلتر، تنوع و داده ساختاری نیست.",
                suggestedFix: { relation: "terms" },
            }),
        );
    return issues;
}

function contentRules(evidence: SeoEvidence, profile: SeoEngineProfile): SeoIssueDraft[] {
    if (evidence.kind !== "content_post") return [];
    const issues: SeoIssueDraft[] = [];
    const count = wordCount(evidence.contentText);
    if (count < 250)
        issues.push(
            issue({
                ruleCode: "content.article.short",
                severity: "warning",
                component: "content",
                penalty: 15,
                title: "متن نوشته کوتاه است",
                description: "محتوای منتشرشده باید پاسخ کامل و قابل مشاهده به موضوع ارائه کند.",
                evidence: { word_count: count },
                suggestedFix: { minimum_words: 250 },
            }),
        );
    if (!evidence.authorId)
        issues.push(
            issue({
                ruleCode: "schema.article.author_missing",
                severity: "warning",
                component: "schema",
                penalty: 10,
                title: "نویسنده مشخص نیست",
                description: "برای Article/BlogPosting نویسنده واقعی و قابل نمایش لازم است.",
                suggestedFix: { field: "author_user_id" },
            }),
        );
    if ((evidence.relatedProductCount ?? 0) < 1 && profile === "k21")
        issues.push(
            issue({
                ruleCode: "content.commerce_link.missing",
                severity: "info",
                component: "commerce",
                penalty: 5,
                title: "نوشته به محصول متصل نیست",
                description: "در Profile پیشرفته، ارتباط واقعی محتوا با محصولات مرتبط بررسی می‌شود.",
                suggestedFix: { relation: "product" },
            }),
        );
    return issues;
}

function mediaRules(evidence: SeoEvidence): SeoIssueDraft[] {
    if (evidence.kind !== "media") return [];
    const issues: SeoIssueDraft[] = [];
    if (!normalize(evidence.title))
        issues.push(
            issue({
                ruleCode: "media.title.missing",
                severity: "info",
                component: "media",
                penalty: 5,
                title: "عنوان رسانه ثبت نشده است",
                description: "عنوان مدیریتی مشخص به بازیابی و استفاده درست رسانه کمک می‌کند.",
                suggestedFix: { field: "media.title" },
            }),
        );
    if ((evidence.imageAltCount ?? 0) < 1)
        issues.push(
            issue({
                ruleCode: "media.alt.missing",
                severity: "warning",
                component: "media",
                penalty: 18,
                title: "متن ALT ثبت نشده است",
                description: "برای تصویر استفاده‌شده در صفحات عمومی، ALT توصیفی ثبت کنید.",
                suggestedFix: { field: "media.alt" },
            }),
        );
    if (!evidence.imageWidth || !evidence.imageHeight)
        issues.push(
            issue({
                ruleCode: "media.dimensions.missing",
                severity: "info",
                component: "technical",
                penalty: 6,
                title: "ابعاد تصویر مشخص نیست",
                description: "ابعاد واقعی تصویر برای جلوگیری از Layout shift و خروجی Image sitemap مفید است.",
                suggestedFix: { field: "media.dimensions" },
            }),
        );
    return issues;
}

function internalLinkRules(evidence: SeoEvidence, profile: SeoEngineProfile): SeoIssueDraft[] {
    if (profile !== "k21" || evidence.kind === "media") return [];
    if ((evidence.internalInboundCount ?? 0) > 0 || (evidence.status !== "publish" && evidence.status !== "published")) return [];
    return [
        issue({
            ruleCode: "links.orphan",
            severity: "warning",
            component: "technical",
            penalty: 8,
            title: "موجودیت منتشرشده لینک داخلی ورودی ندارد",
            description: "صفحه مهم باید از حداقل یک صفحه قابل Crawl لینک داخلی دریافت کند.",
            evidence: { inbound_links: 0 },
            suggestedFix: { action: "create_internal_link" },
        }),
    ];
}

export function analyzeSeoEvidence(
    evidence: SeoEvidence,
    profile: SeoEngineProfile = evidence.profile?.engineProfile ?? "k20",
): SeoScoreResult {
    const issues = [
        ...baseRules(evidence),
        ...productRules(evidence, profile),
        ...taxonomyRules(evidence),
        ...contentRules(evidence, profile),
        ...mediaRules(evidence),
        ...internalLinkRules(evidence, profile),
    ];
    const componentScores = { technical: 100, content: 100, schema: 100, media: 100, commerce: 100 };
    for (const item of issues) componentScores[item.component] = bounded(componentScores[item.component] - item.penalty);
    const weights =
        evidence.kind === "product"
            ? { technical: 0.25, content: 0.2, schema: 0.2, media: 0.15, commerce: 0.2 }
            : evidence.kind === "content_post"
              ? { technical: 0.25, content: 0.35, schema: 0.2, media: 0.1, commerce: 0.1 }
              : { technical: 0.3, content: 0.25, schema: 0.15, media: 0.15, commerce: 0.15 };
    const total = bounded(
        Object.entries(weights).reduce(
            (sum, [key, weight]) => sum + componentScores[key as keyof typeof componentScores] * weight,
            0,
        ),
    );
    return { total, ...componentScores, issues };
}

export const seoAnalyzerInternals = { normalize, plainText, wordCount };
