export type SeoEntityKind = "product" | "category" | "brand" | "attribute" | "content_post" | "media" | "page";
export type SeoEngineProfile = "k20" | "k21";
export type SeoSeverity = "info" | "warning" | "critical";
export type SeoIssueStatus = "open" | "ignored" | "resolved" | "regressed";

export interface Paginated<T> {
    data: T[];
    meta: { total: number; per_page: number; current_page: number; last_page: number };
}

export interface Resource<T> {
    data: T;
}

export interface SeoScore {
    total: number;
    technical: number;
    content: number;
    schema: number;
    media: number;
    commerce: number;
    issues: SeoIssueDraft[];
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

export interface SeoProfile {
    id?: number;
    engineProfile?: SeoEngineProfile;
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
    version?: number;
    scoreTotal?: number;
    scoreTechnical?: number;
    scoreContent?: number;
    scoreSchema?: number;
    scoreMedia?: number;
    scoreCommerce?: number;
}

export interface SeoEntity {
    kind: SeoEntityKind;
    id: number;
    key: string;
    locale: "fa" | "en";
    title: string | null;
    slug: string | null;
    status: string | null;
    public_url: string | null;
    updated_at: string | null;
    score: SeoScore;
    profile: SeoProfile;
}

export interface SeoEntityDetail extends SeoEntity {
    evidence: Record<string, unknown>;
    schema: Record<string, unknown> | null;
    issues: SeoIssue[];
}

export interface SeoIssue {
    id: number;
    profile_id: number | null;
    audit_run_id: number | null;
    entity_kind: SeoEntityKind;
    entity_id: number | null;
    entity_key: string;
    locale: "fa" | "en";
    rule_code: string;
    severity: SeoSeverity;
    status: SeoIssueStatus;
    title: string;
    description: string;
    evidence: Record<string, unknown>;
    suggested_fix: Record<string, unknown>;
    first_seen_at: string | null;
    last_seen_at: string | null;
    resolved_at: string | null;
}

export interface SeoOverview {
    engine_profile: SeoEngineProfile;
    entities: { products: number; content_posts: number; media: number; analyzed: number; unanalyzed: number };
    health: { average_score: number; healthy: number; critical: number };
    issues: { open: number; critical: number; warning: number; resolved: number };
    keywords: { total: number; top_ten: number; improved: number; declined: number };
    content_impact: { views: number; product_clicks: number; assisted_orders: number; assisted_revenue_minor: number };
    last_audit: null | {
        id: number;
        kind: string;
        status: string;
        started_at: string | null;
        completed_at: string | null;
        counters: Record<string, number>;
    };
    integrations: Array<{ provider: string; status: string; last_synced_at: string | null; last_error: string | null }>;
}

export interface SeoKeyword {
    id: number;
    phrase: string;
    locale: "fa" | "en";
    target_entity_kind: SeoEntityKind | null;
    target_entity_id: number | null;
    target_url: string | null;
    search_engine: string;
    country: string | null;
    city: string | null;
    device: "desktop" | "mobile" | "tablet";
    current_position: number | null;
    previous_position: number | null;
    best_position: number | null;
    search_volume: number | null;
    difficulty: number | null;
    source: string;
    last_checked_at: string | null;
}

export interface SeoCompetitor {
    id: number;
    domain: string;
    label: string | null;
    enabled: boolean;
    source: string;
    metrics: Record<string, unknown>;
    last_synced_at: string | null;
}

export interface SeoInternalLink {
    id: number;
    source_kind: SeoEntityKind;
    source_key: string;
    target_kind: SeoEntityKind;
    target_key: string;
    anchor: string;
    relation: string;
    status: "suggested" | "approved" | "applied" | "rejected" | "removed";
}

export interface SeoRedirect {
    id: number;
    source_path: string;
    target_path: string | null;
    status_code: 301 | 302 | 307 | 308 | 410;
    enabled: boolean;
    hit_count: number;
    last_hit_at: string | null;
}

export interface SeoIntegration {
    provider: string;
    status: "disconnected" | "configured" | "connected" | "error" | "disabled";
    configuration: Record<string, unknown>;
    credential_env_ref: string | null;
    credential_configured: boolean;
    last_synced_at?: string | null;
    last_error?: string | null;
}

export interface SeoSettings {
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

export interface SeoReport {
    by_entity: Array<{ entity_kind: SeoEntityKind; total: number; average_score: number }>;
    top_issues: Array<{ severity: SeoSeverity; rule_code: string; count: number }>;
    stale_content_count: number;
    published_products_count: number;
    content_impact: { views: number; product_clicks: number; assisted_orders: number; assisted_revenue_minor: number };
    events: Array<Record<string, unknown>>;
}
