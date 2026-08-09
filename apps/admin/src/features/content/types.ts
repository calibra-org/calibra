export type ContentType = "article" | "news" | "guide" | "case_study" | "landing";
export type ContentStatus = "draft" | "in_review" | "approved" | "scheduled" | "published" | "archived";
export type ContentAgentKind =
    | "trend_scout"
    | "source_intelligence"
    | "strategist"
    | "writer"
    | "editor"
    | "seo"
    | "commerce"
    | "governance"
    | "publisher"
    | "refresh";

export interface ContentCategory {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    parent_id: number | null;
    position: number;
    is_active: boolean;
    posts_count: number;
}
export interface ContentTag {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    posts_count: number;
}
export interface ContentProduct {
    id: number;
    name: string | null;
    sku: string | null;
    slug: string | null;
    status: string;
    relation_type?: string;
    position?: number;
}
export interface ContentMedia {
    id: number;
    url: string;
    alt: string | null;
    title?: string | null;
    filename?: string;
    mime?: string;
    width?: number | null;
    height?: number | null;
}
export interface ContentUser {
    id: number;
    email: string;
    role?: string;
    locale?: string;
}
export interface ContentOrder {
    id: number;
    order_number: number;
    status: string;
    grand_total: number;
    currency: string;
    created_at: string;
    first_name?: string | null;
    last_name?: string | null;
    value_minor?: number;
    metadata?: Record<string, unknown>;
}

export interface ContentPost {
    id: number;
    type: ContentType;
    status: ContentStatus;
    locale: "fa" | "en";
    title: string;
    slug: string;
    excerpt: string | null;
    content_html: string;
    featured_media_id: number | null;
    author_user_id: number | null;
    reviewer_user_id: number | null;
    source_signal_id: number | null;
    seo_title: string | null;
    meta_description: string | null;
    canonical_url: string | null;
    robots_index: boolean;
    robots_follow: boolean;
    schema_type: "Article" | "BlogPosting" | "NewsArticle";
    search_intent: "informational" | "commercial" | "transactional" | "navigational" | "mixed" | null;
    focus_keyword: string | null;
    structured_data: Record<string, unknown>;
    scheduled_at: string | null;
    approved_at: string | null;
    published_at: string | null;
    archived_at: string | null;
    version: number;
    word_count: number;
    reading_time_minutes: number;
    seo_score: number;
    quality_score: number;
    commerce_score: number;
    views_count: number;
    product_clicks_count: number;
    assisted_orders_count: number;
    assisted_revenue_minor: number;
    created_at: string;
    updated_at: string;
    author?: ContentUser | null;
    reviewer?: ContentUser | null;
    featured_media?: ContentMedia | null;
    categories: ContentCategory[];
    tags: ContentTag[];
    products: ContentProduct[];
    events?: Array<{
        id: number;
        event_type: string;
        metadata: Record<string, unknown>;
        created_at: string;
        actor_user_id: number | null;
    }>;
    revisions?: Array<{
        id: number;
        version: number;
        change_summary: string | null;
        created_at: string;
        created_by_user_id: number | null;
    }>;
    attributed_orders?: ContentOrder[];
}

export interface ContentPostInput {
    type: ContentType;
    locale: "fa" | "en";
    title: string;
    slug?: string;
    excerpt?: string | null;
    content_html: string;
    featured_media_id?: number | null;
    author_user_id?: number | null;
    reviewer_user_id?: number | null;
    source_signal_id?: number | null;
    seo_title?: string | null;
    meta_description?: string | null;
    canonical_url?: string | null;
    robots_index?: boolean;
    robots_follow?: boolean;
    schema_type?: "Article" | "BlogPosting" | "NewsArticle";
    search_intent?: ContentPost["search_intent"];
    focus_keyword?: string | null;
    structured_data?: Record<string, unknown>;
    scheduled_at?: string | null;
    category_ids?: number[];
    tag_ids?: number[];
    product_ids?: number[];
    change_summary?: string | null;
    status?: ContentStatus;
}

export interface ContentSummary {
    totals: Record<string, number> & { total: number };
    scores: { seo: number; quality: number; commerce: number };
    performance: { views: number; product_clicks: number; assisted_revenue_minor: number };
    action_counts: { scheduled_next_7_days: number; high_opportunity_signals: number; active_agent_runs: number };
    top_posts: Array<
        Pick<
            ContentPost,
            "id" | "title" | "views_count" | "product_clicks_count" | "assisted_revenue_minor" | "seo_score" | "quality_score"
        >
    >;
}

export interface ContentSignal {
    id: number;
    source_id: number | null;
    source_name: string | null;
    title: string;
    summary: string | null;
    url: string | null;
    topic: string | null;
    status: "new" | "reviewed" | "converted" | "ignored";
    sentiment: "positive" | "neutral" | "negative" | "mixed";
    source_trust_score: number;
    business_relevance_score: number;
    opportunity_score: number;
    risk_score: number;
    published_at: string | null;
    fetched_at: string;
}

export interface ContentSource {
    id: number;
    name: string;
    url: string | null;
    feed_url: string | null;
    source_type: "rss" | "atom" | "website" | "api" | "manual";
    status: "active" | "paused" | "error" | "fetching";
    trust_score: number;
    topics: string[];
    crawl_interval_minutes: number;
    last_fetched_at: string | null;
    next_fetch_at: string | null;
    error_count: number;
    last_error: string | null;
}

export interface ContentAgentRun {
    id: number;
    post_id: number | null;
    signal_id: number | null;
    agent_kind: ContentAgentKind;
    status: "queued" | "running" | "completed" | "failed" | "blocked" | "approved" | "rejected";
    model: string | null;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    evidence: Array<{ url: string; title?: string }>;
    human_review_required: boolean;
    reviewed_by_user_id: number | null;
    applied_post_id: number | null;
    review_note: string | null;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    approved_at: string | null;
    applied_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ContentSettings {
    default_locale: "fa" | "en";
    default_author_user_id: number | null;
    require_review_before_publish: boolean;
    allow_agent_web_search: boolean;
    allow_agent_publish: boolean;
    auto_publish_due: boolean;
    source_fetch_enabled: boolean;
    brand_voice: string;
    allowed_topics: string[];
    blocked_topics: string[];
    content_model: string;
    minimum_source_trust: number;
    minimum_publish_quality: number;
}

export interface Paginated<T> {
    data: T[];
    meta: { page: number; limit: number; total: number; last_page: number };
}
export interface ResourceResponse<T> {
    data: T;
}
