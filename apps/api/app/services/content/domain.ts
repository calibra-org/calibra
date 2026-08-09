import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";

export const CONTENT_TYPES = ["article", "news", "guide", "case_study", "landing"] as const;
export const CONTENT_STATUSES = ["draft", "in_review", "approved", "scheduled", "published", "archived"] as const;
export const CONTENT_AGENT_KINDS = [
    "trend_scout",
    "source_intelligence",
    "strategist",
    "writer",
    "editor",
    "seo",
    "commerce",
    "governance",
    "publisher",
    "refresh",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type ContentAgentKind = (typeof CONTENT_AGENT_KINDS)[number];

const TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
    draft: ["in_review", "archived"],
    in_review: ["draft", "approved", "archived"],
    approved: ["draft", "scheduled", "published", "archived"],
    scheduled: ["draft", "approved", "published", "archived"],
    published: ["draft", "archived"],
    archived: ["draft"],
};

export function canTransitionContent(from: ContentStatus, to: ContentStatus): boolean {
    return from === to || TRANSITIONS[from].includes(to);
}

export function normalizePersian(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[يى]/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/[ۀة]/g, "ه")
        .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
        .replace(/\u200c+/g, "‌")
        .replace(/\s+/g, " ")
        .trim();
}

export function slugifyContent(value: string): string {
    const normalized = normalizePersian(value).toLowerCase();
    const slug = normalized
        .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    return slug.slice(0, 191) || "untitled";
}

export function sanitizeContentHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: [
            "p",
            "br",
            "strong",
            "em",
            "ul",
            "ol",
            "li",
            "h2",
            "h3",
            "h4",
            "blockquote",
            "a",
            "code",
            "pre",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "figure",
            "figcaption",
            "img",
            "details",
            "summary",
        ],
        allowedAttributes: {
            a: ["href", "target", "rel", "title"],
            img: ["src", "alt", "title", "width", "height", "loading"],
            th: ["scope", "colspan", "rowspan"],
            td: ["colspan", "rowspan"],
        },
        allowedSchemes: ["http", "https", "mailto", "tel"],
        allowProtocolRelative: false,
        transformTags: {
            a: (_tagName, attribs) => ({
                tagName: "a",
                attribs: {
                    ...attribs,
                    rel: "noopener noreferrer",
                    ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
                },
            }),
            img: (_tagName, attribs) => ({
                tagName: "img",
                attribs: { ...attribs, loading: attribs.loading === "eager" ? "eager" : "lazy" },
            }),
        },
    });
}

export function plainTextFromHtml(html: string): string {
    return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function calculateContentMetrics(input: {
    title: string;
    excerpt?: string | null;
    contentHtml: string;
    seoTitle?: string | null;
    metaDescription?: string | null;
    focusKeyword?: string | null;
    featuredMediaId?: number | null;
    categoryIds?: readonly number[];
    productIds?: readonly number[];
    canonicalUrl?: string | null;
}): { wordCount: number; readingTimeMinutes: number; seoScore: number; qualityScore: number; commerceScore: number } {
    const text = plainTextFromHtml(input.contentHtml);
    const words = text.length === 0 ? [] : text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTimeMinutes = wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 220));
    const keyword = normalizePersian(input.focusKeyword ?? "").toLowerCase();
    const haystack = normalizePersian(`${input.title} ${input.excerpt ?? ""} ${text}`).toLowerCase();

    let seoScore = 0;
    if (input.title.trim().length >= 20 && input.title.trim().length <= 90) seoScore += 15;
    if ((input.seoTitle ?? "").trim().length >= 20 && (input.seoTitle ?? "").trim().length <= 65) seoScore += 15;
    if ((input.metaDescription ?? "").trim().length >= 80 && (input.metaDescription ?? "").trim().length <= 170) seoScore += 15;
    if (input.featuredMediaId) seoScore += 10;
    if ((input.categoryIds?.length ?? 0) > 0) seoScore += 10;
    if (wordCount >= 300) seoScore += 15;
    if (keyword.length > 1 && haystack.includes(keyword)) seoScore += 10;
    if ((input.canonicalUrl ?? "").trim().length > 0) seoScore += 5;
    if (/<h2[\s>]/i.test(input.contentHtml)) seoScore += 5;

    let qualityScore = 0;
    if ((input.excerpt ?? "").trim().length >= 60) qualityScore += 15;
    if (wordCount >= 500) qualityScore += 25;
    else if (wordCount >= 250) qualityScore += 15;
    if (/<h2[\s>]/i.test(input.contentHtml)) qualityScore += 15;
    if (/<(ul|ol|table)[\s>]/i.test(input.contentHtml)) qualityScore += 15;
    if (/<(blockquote|details)[\s>]/i.test(input.contentHtml)) qualityScore += 10;
    if (/href=/i.test(input.contentHtml)) qualityScore += 10;
    if (input.featuredMediaId) qualityScore += 10;

    let commerceScore = 0;
    const productCount = input.productIds?.length ?? 0;
    if (productCount > 0) commerceScore += 45;
    if (productCount >= 2) commerceScore += 15;
    if (/خرید|محصول|قیمت|سفارش|مقایسه|راهنمای انتخاب/i.test(haystack)) commerceScore += 20;
    if (/cta|افزودن به سبد|دریافت پیش.?فاکتور/i.test(haystack)) commerceScore += 20;

    return {
        wordCount,
        readingTimeMinutes,
        seoScore: Math.min(100, seoScore),
        qualityScore: Math.min(100, qualityScore),
        commerceScore: Math.min(100, commerceScore),
    };
}

const SIGNAL_TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "ref", "ref_src"]);

export function canonicalizeSignalUrl(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        url.hash = "";
        url.hostname = url.hostname.toLowerCase();
        if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
        for (const key of [...url.searchParams.keys()]) {
            if (key.toLowerCase().startsWith("utm_") || SIGNAL_TRACKING_PARAMETERS.has(key.toLowerCase())) {
                url.searchParams.delete(key);
            }
        }
        url.searchParams.sort();
        if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
        return url.toString();
    } catch {
        return null;
    }
}

export function signalFingerprint(input: { url?: string | null; title: string; publishedAt?: string | null }): string {
    const canonicalUrl = canonicalizeSignalUrl(input.url);
    const identity = canonicalUrl
        ? `url:${canonicalUrl}`
        : `title:${normalizePersian(input.title).toLowerCase()}|published:${input.publishedAt ?? ""}`;
    return createHash("sha256").update(identity).digest("hex");
}
