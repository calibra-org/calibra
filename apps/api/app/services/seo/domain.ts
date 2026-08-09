export const SEO_ENTITY_KINDS = ["product", "category", "brand", "attribute", "content_post", "media", "page"] as const;
export type SeoEntityKind = (typeof SEO_ENTITY_KINDS)[number];

export const SEO_ENGINE_PROFILES = ["k20", "k21"] as const;
export type SeoEngineProfile = (typeof SEO_ENGINE_PROFILES)[number];

export const SEO_SEVERITIES = ["info", "warning", "critical"] as const;
export type SeoSeverity = (typeof SEO_SEVERITIES)[number];

export interface SeoProfileInput {
    metaTitle?: string | null;
    metaDescription?: string | null;
    focusKeyword?: string | null;
    secondaryKeywords?: string[];
    canonicalUrl?: string | null;
    robotsIndex?: boolean;
    robotsFollow?: boolean;
    ogTitle?: string | null;
    ogDescription?: string | null;
    socialMediaId?: number | null;
    schemaType?: string | null;
    schemaOverrides?: Record<string, unknown>;
    engineProfile?: SeoEngineProfile;
}

export interface SeoEvidence {
    kind: SeoEntityKind;
    key: string;
    id?: number | null;
    locale: string;
    publicUrl?: string | null;
    title?: string | null;
    slug?: string | null;
    description?: string | null;
    shortDescription?: string | null;
    contentText?: string | null;
    status?: string | null;
    updatedAt?: string | null;
    publishedAt?: string | null;
    authorId?: number | null;
    authorName?: string | null;
    sku?: string | null;
    gtin?: string | null;
    brandCount?: number;
    brandName?: string | null;
    categoryNames?: string[];
    categoryCount?: number;
    attributeCount?: number;
    termCount?: number;
    productCount?: number;
    imageCount?: number;
    imageUrls?: string[];
    featuredImageUrl?: string | null;
    imageAltCount?: number;
    imageWidth?: number | null;
    imageHeight?: number | null;
    mime?: string | null;
    priceMinor?: number | null;
    stockStatus?: string | null;
    variationCount?: number;
    relatedProductCount?: number;
    internalInboundCount?: number;
    internalOutboundCount?: number;
    profile?: SeoProfileInput | null;
}

export interface SeoIssueDraft {
    ruleCode: string;
    severity: SeoSeverity;
    title: string;
    description: string;
    evidence: Record<string, unknown>;
    suggestedFix: Record<string, unknown>;
    component: "technical" | "content" | "schema" | "media" | "commerce";
    penalty: number;
}

export interface SeoScoreResult {
    total: number;
    technical: number;
    content: number;
    schema: number;
    media: number;
    commerce: number;
    issues: SeoIssueDraft[];
}

export interface SeoSiteSettings {
    engine_profile: SeoEngineProfile;
    base_url: string;
    default_locale: "fa" | "en";
    title_separator: string;
    organization_name: string;
    organization_logo_url: string | null;
    robots_enabled: boolean;
    robots_allow_all: boolean;
    robots_disallow: string[];
    openai_searchbot_allowed: boolean;
    sitemap_enabled: boolean;
    sitemap_products: boolean;
    sitemap_categories: boolean;
    sitemap_brands: boolean;
    sitemap_content: boolean;
    sitemap_images: boolean;
    schema_enabled: boolean;
    indexnow_enabled: boolean;
    indexnow_key_location: string | null;
    content_stale_days: number;
}

export const DEFAULT_SEO_SETTINGS: SeoSiteSettings = {
    engine_profile: "k20",
    base_url: "",
    default_locale: "fa",
    title_separator: "|",
    organization_name: "Calibra Store",
    organization_logo_url: null,
    robots_enabled: true,
    robots_allow_all: true,
    robots_disallow: ["/admin", "/api", "/checkout", "/account"],
    openai_searchbot_allowed: true,
    sitemap_enabled: true,
    sitemap_products: true,
    sitemap_categories: true,
    sitemap_brands: true,
    sitemap_content: true,
    sitemap_images: true,
    schema_enabled: true,
    indexnow_enabled: false,
    indexnow_key_location: null,
    content_stale_days: 180,
};
