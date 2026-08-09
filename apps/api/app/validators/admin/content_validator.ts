import vine from "@vinejs/vine";

import { CONTENT_AGENT_KINDS, CONTENT_STATUSES, CONTENT_TYPES } from "#services/content/domain";

const optionalText = (max: number) => vine.string().trim().maxLength(max).optional().nullable();
const idArray = vine.array(vine.number().positive().withoutDecimals()).maxLength(100).optional();

const postShape = {
    type: vine.enum(CONTENT_TYPES),
    locale: vine.enum(["fa", "en"] as const).optional(),
    title: vine.string().trim().minLength(3).maxLength(500),
    slug: vine.string().trim().minLength(1).maxLength(191).optional(),
    excerpt: optionalText(2000),
    content_html: vine.string().maxLength(500_000),
    featured_media_id: vine.number().positive().withoutDecimals().optional().nullable(),
    author_user_id: vine.number().positive().withoutDecimals().optional().nullable(),
    reviewer_user_id: vine.number().positive().withoutDecimals().optional().nullable(),
    source_signal_id: vine.number().positive().withoutDecimals().optional().nullable(),
    seo_title: optionalText(255),
    meta_description: optionalText(500),
    canonical_url: optionalText(2000),
    robots_index: vine.boolean().optional(),
    robots_follow: vine.boolean().optional(),
    schema_type: vine.enum(["Article", "BlogPosting", "NewsArticle"] as const).optional(),
    search_intent: vine
        .enum(["informational", "commercial", "transactional", "navigational", "mixed"] as const)
        .optional()
        .nullable(),
    focus_keyword: optionalText(180),
    structured_data: vine.record(vine.any()).optional(),
    scheduled_at: optionalText(64),
    category_ids: idArray,
    tag_ids: idArray,
    product_ids: idArray,
    change_summary: optionalText(1000),
};

export const adminContentPostListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(100).withoutDecimals().optional(),
        q: vine.string().trim().maxLength(180).optional(),
        type: vine.enum(CONTENT_TYPES).optional(),
        status: vine.enum(CONTENT_STATUSES).optional(),
        category_id: vine.number().positive().withoutDecimals().optional(),
        author_user_id: vine.number().positive().withoutDecimals().optional(),
        product_id: vine.number().positive().withoutDecimals().optional(),
        from: optionalText(64),
        to: optionalText(64),
        sort: vine.enum(["updated_desc", "created_desc", "published_desc", "title_asc", "score_desc"] as const).optional(),
    }),
);

export const adminContentPostCreateValidator = vine.compile(
    vine.object({ ...postShape, status: vine.enum(["draft", "in_review"] as const).optional() }),
);
export const adminContentPostUpdateValidator = vine.compile(
    vine.object({ ...postShape, expected_version: vine.number().min(1).withoutDecimals() }),
);
export const adminContentTransitionValidator = vine.compile(
    vine.object({
        to_status: vine.enum(CONTENT_STATUSES),
        expected_version: vine.number().min(1).withoutDecimals(),
        scheduled_at: optionalText(64),
        reason: optionalText(1000),
    }),
);
export const adminContentRestoreRevisionValidator = vine.compile(
    vine.object({ expected_version: vine.number().min(1).withoutDecimals(), change_summary: optionalText(1000) }),
);

export const adminContentTaxonomyValidator = vine.compile(
    vine.object({
        kind: vine.enum(["category", "tag"] as const),
        name: vine.string().trim().minLength(1).maxLength(180),
        slug: vine.string().trim().minLength(1).maxLength(191).optional(),
        description: optionalText(2000),
        parent_id: vine.number().positive().withoutDecimals().optional().nullable(),
        position: vine.number().min(0).max(100_000).withoutDecimals().optional(),
        is_active: vine.boolean().optional(),
    }),
);

export const adminContentTaxonomyDeleteValidator = vine.compile(vine.object({ kind: vine.enum(["category", "tag"] as const) }));

export const adminContentSignalStatusValidator = vine.compile(
    vine.object({ status: vine.enum(["reviewed", "ignored"] as const) }),
);

export const adminContentSourceValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(180),
        url: optionalText(2000),
        feed_url: optionalText(2000),
        source_type: vine.enum(["rss", "atom", "website", "api", "manual"] as const),
        status: vine.enum(["active", "paused", "error"] as const).optional(),
        trust_score: vine.number().min(0).max(100).withoutDecimals().optional(),
        topics: vine.array(vine.string().trim().maxLength(120)).maxLength(50).optional(),
        crawl_interval_minutes: vine.number().min(15).max(43_200).withoutDecimals().optional(),
    }),
);

export const adminContentSignalListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(100).withoutDecimals().optional(),
        q: vine.string().trim().maxLength(180).optional(),
        status: vine.enum(["new", "reviewed", "converted", "ignored"] as const).optional(),
        source_id: vine.number().positive().withoutDecimals().optional(),
        min_opportunity: vine.number().min(0).max(100).withoutDecimals().optional(),
    }),
);

export const adminContentSignalCreateValidator = vine.compile(
    vine.object({
        source_id: vine.number().positive().withoutDecimals().optional().nullable(),
        url: optionalText(2000),
        title: vine.string().trim().minLength(3).maxLength(500),
        summary: optionalText(10_000),
        published_at: optionalText(64),
        language: vine.enum(["fa", "en"] as const).optional(),
        topic: optionalText(120),
        source_trust_score: vine.number().min(0).max(100).withoutDecimals().optional(),
        business_relevance_score: vine.number().min(0).max(100).withoutDecimals().optional(),
        opportunity_score: vine.number().min(0).max(100).withoutDecimals().optional(),
        risk_score: vine.number().min(0).max(100).withoutDecimals().optional(),
        sentiment: vine.enum(["positive", "neutral", "negative", "mixed"] as const).optional(),
    }),
);

export const adminContentAgentRunValidator = vine.compile(
    vine.object({
        agent_kind: vine.enum(CONTENT_AGENT_KINDS),
        post_id: vine.number().positive().withoutDecimals().optional().nullable(),
        signal_id: vine.number().positive().withoutDecimals().optional().nullable(),
        instruction: vine.string().trim().minLength(3).maxLength(20_000),
        use_web_search: vine.boolean().optional(),
    }),
);

export const adminContentAgentListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(100).withoutDecimals().optional(),
        status: vine.enum(["queued", "running", "completed", "failed", "blocked", "approved", "rejected"] as const).optional(),
        agent_kind: vine.enum(CONTENT_AGENT_KINDS).optional(),
    }),
);

export const adminContentAgentReviewValidator = vine.compile(
    vine.object({ decision: vine.enum(["approved", "rejected"] as const), note: optionalText(2000) }),
);

export const adminContentAttributionValidator = vine.compile(
    vine.object({
        order_id: vine.number().positive().withoutDecimals(),
        product_id: vine.number().positive().withoutDecimals().optional().nullable(),
        note: optionalText(1000),
    }),
);

export const adminContentSettingsValidator = vine.compile(
    vine.object({
        default_locale: vine.enum(["fa", "en"] as const).optional(),
        default_author_user_id: vine.number().positive().withoutDecimals().optional().nullable(),
        require_review_before_publish: vine.boolean().optional(),
        allow_agent_web_search: vine.boolean().optional(),
        allow_agent_publish: vine.boolean().optional(),
        auto_publish_due: vine.boolean().optional(),
        source_fetch_enabled: vine.boolean().optional(),
        brand_voice: optionalText(5000),
        allowed_topics: vine.array(vine.string().trim().maxLength(180)).maxLength(100).optional(),
        blocked_topics: vine.array(vine.string().trim().maxLength(180)).maxLength(100).optional(),
        content_model: optionalText(80),
        minimum_source_trust: vine.number().min(0).max(100).withoutDecimals().optional(),
        minimum_publish_quality: vine.number().min(0).max(100).withoutDecimals().optional(),
    }),
);

export const adminContentResourceValidator = vine.compile(
    vine.object({
        kind: vine.enum(["products", "orders", "users", "media"] as const),
        q: vine.string().trim().maxLength(180).optional(),
        limit: vine.number().min(1).max(50).withoutDecimals().optional(),
    }),
);

export const publicContentListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(50).withoutDecimals().optional(),
        type: vine.enum(CONTENT_TYPES).optional(),
        category: vine.string().trim().maxLength(191).optional(),
        q: vine.string().trim().maxLength(180).optional(),
        locale: vine.enum(["fa", "en"] as const).optional(),
    }),
);

export const publicContentEventValidator = vine.compile(
    vine.object({
        post_id: vine.number().positive().withoutDecimals(),
        product_id: vine.number().positive().withoutDecimals().optional().nullable(),
        event_type: vine.enum(["view", "product_click", "add_to_cart"] as const),
        session_key: optionalText(80),
        metadata: vine.record(vine.any()).optional(),
    }),
);
