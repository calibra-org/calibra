import vine from "@vinejs/vine";

import { SEO_ENGINE_PROFILES, SEO_ENTITY_KINDS } from "#services/seo/domain";

const nullableText = (max: number) => vine.string().trim().maxLength(max).optional().nullable();
const positiveId = vine.number().positive().withoutDecimals();

export const adminSeoEntityListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(100).withoutDecimals().optional(),
        q: vine.string().trim().maxLength(180).optional(),
        kind: vine.enum(SEO_ENTITY_KINDS).optional(),
        locale: vine.enum(["fa", "en"] as const).optional(),
        status: vine.string().trim().maxLength(32).optional(),
        score_max: vine.number().min(0).max(100).withoutDecimals().optional(),
        issue_status: vine.enum(["open", "ignored", "resolved", "regressed"] as const).optional(),
        sort: vine.enum(["updated_desc", "score_asc", "score_desc", "title_asc"] as const).optional(),
    }),
);

export const adminSeoEntityRouteValidator = vine.compile(
    vine.object({
        kind: vine.enum(SEO_ENTITY_KINDS),
        id: positiveId,
        locale: vine.enum(["fa", "en"] as const).optional(),
    }),
);

export const adminSeoProfileUpdateValidator = vine.compile(
    vine.object({
        locale: vine.enum(["fa", "en"] as const).optional(),
        engineProfile: vine.enum(SEO_ENGINE_PROFILES).optional(),
        metaTitle: nullableText(255),
        metaDescription: nullableText(500),
        focusKeyword: nullableText(180),
        secondaryKeywords: vine.array(vine.string().trim().maxLength(180)).maxLength(100).optional(),
        canonicalUrl: nullableText(2000),
        robotsIndex: vine.boolean().optional(),
        robotsFollow: vine.boolean().optional(),
        ogTitle: nullableText(255),
        ogDescription: nullableText(500),
        socialMediaId: positiveId.optional().nullable(),
        schemaType: nullableText(80),
        schemaOverrides: vine.record(vine.any()).optional(),
        expected_version: vine.number().min(1).withoutDecimals().optional(),
    }),
);

export const adminSeoAuditRunValidator = vine.compile(
    vine.object({
        kinds: vine.array(vine.enum(SEO_ENTITY_KINDS)).maxLength(7).optional(),
        locale: vine.enum(["fa", "en"] as const).optional(),
        engine_profile: vine.enum(SEO_ENGINE_PROFILES).optional(),
    }),
);

export const adminSeoIssueListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(100).withoutDecimals().optional(),
        q: vine.string().trim().maxLength(180).optional(),
        severity: vine.enum(["info", "warning", "critical"] as const).optional(),
        status: vine.enum(["open", "ignored", "resolved", "regressed"] as const).optional(),
        entity_kind: vine.enum(SEO_ENTITY_KINDS).optional(),
        rule_code: vine.string().trim().maxLength(120).optional(),
    }),
);

export const adminSeoIssueStatusValidator = vine.compile(
    vine.object({ status: vine.enum(["open", "ignored", "resolved", "regressed"] as const) }),
);

export const adminSeoKeywordValidator = vine.compile(
    vine.object({
        phrase: vine.string().trim().minLength(1).maxLength(255),
        locale: vine.enum(["fa", "en"] as const).optional(),
        target_entity_kind: vine.enum(SEO_ENTITY_KINDS).optional().nullable(),
        target_entity_id: positiveId.optional().nullable(),
        target_url: nullableText(2000),
        search_engine: vine.string().trim().minLength(1).maxLength(24).optional(),
        country: nullableText(2),
        city: nullableText(120),
        device: vine.enum(["desktop", "mobile", "tablet"] as const).optional(),
        current_position: vine.number().min(1).withoutDecimals().optional().nullable(),
        search_volume: vine.number().min(0).withoutDecimals().optional().nullable(),
        difficulty: vine.number().min(0).max(100).withoutDecimals().optional().nullable(),
        source: vine.string().trim().maxLength(32).optional(),
    }),
);

export const adminSeoKeywordUpdateValidator = vine.compile(
    vine.object({
        phrase: vine.string().trim().minLength(1).maxLength(255).optional(),
        locale: vine.enum(["fa", "en"] as const).optional(),
        target_entity_kind: vine.enum(SEO_ENTITY_KINDS).optional().nullable(),
        target_entity_id: positiveId.optional().nullable(),
        target_url: nullableText(2000),
        search_engine: vine.string().trim().minLength(1).maxLength(24).optional(),
        country: nullableText(2),
        city: nullableText(120),
        device: vine.enum(["desktop", "mobile", "tablet"] as const).optional(),
        current_position: vine.number().min(1).withoutDecimals().optional().nullable(),
        search_volume: vine.number().min(0).withoutDecimals().optional().nullable(),
        difficulty: vine.number().min(0).max(100).withoutDecimals().optional().nullable(),
        source: vine.string().trim().maxLength(32).optional(),
    }),
);

export const adminSeoCompetitorValidator = vine.compile(
    vine.object({
        domain: vine.string().trim().minLength(3).maxLength(255),
        label: nullableText(180),
        enabled: vine.boolean().optional(),
        source: vine.string().trim().maxLength(32).optional(),
        metrics: vine.record(vine.any()).optional(),
    }),
);

export const adminSeoInternalLinkValidator = vine.compile(
    vine.object({
        source_kind: vine.enum(SEO_ENTITY_KINDS),
        source_key: vine.string().trim().minLength(3).maxLength(191),
        target_kind: vine.enum(SEO_ENTITY_KINDS),
        target_key: vine.string().trim().minLength(3).maxLength(191),
        anchor: vine.string().trim().minLength(1).maxLength(255),
        relation: vine.string().trim().maxLength(32).optional(),
        status: vine.enum(["suggested", "approved", "applied", "rejected", "removed"] as const).optional(),
        evidence: vine.record(vine.any()).optional(),
    }),
);

export const adminSeoRedirectValidator = vine.compile(
    vine.object({
        source_path: vine.string().trim().minLength(1).maxLength(2000),
        target_path: nullableText(2000),
        status_code: vine.enum([301, 302, 307, 308, 410] as const).optional(),
        enabled: vine.boolean().optional(),
    }),
);

export const adminSeoIntegrationValidator = vine.compile(
    vine.object({
        provider: vine.enum([
            "google_search_console",
            "bing_webmaster",
            "indexnow",
            "google_merchant",
            "openai_searchbot",
            "manual_import",
        ] as const),
        status: vine.enum(["disconnected", "configured", "connected", "error", "disabled"] as const).optional(),
        configuration: vine.record(vine.any()).optional(),
        credential_env_ref: nullableText(180),
    }),
);

export const adminSeoIndexNowValidator = vine.compile(
    vine.object({
        urls: vine.array(vine.string().trim().maxLength(2000)).maxLength(10_000).optional(),
    }),
);

export const adminSeoSettingsValidator = vine.compile(
    vine.object({
        engine_profile: vine.enum(SEO_ENGINE_PROFILES).optional(),
        base_url: vine.string().trim().maxLength(2000).optional(),
        default_locale: vine.enum(["fa", "en"] as const).optional(),
        title_separator: vine.string().trim().maxLength(8).optional(),
        organization_name: vine.string().trim().maxLength(255).optional(),
        organization_logo_url: nullableText(2000),
        robots_enabled: vine.boolean().optional(),
        robots_allow_all: vine.boolean().optional(),
        robots_disallow: vine.array(vine.string().trim().maxLength(2000)).maxLength(200).optional(),
        openai_searchbot_allowed: vine.boolean().optional(),
        sitemap_enabled: vine.boolean().optional(),
        sitemap_products: vine.boolean().optional(),
        sitemap_categories: vine.boolean().optional(),
        sitemap_brands: vine.boolean().optional(),
        sitemap_content: vine.boolean().optional(),
        sitemap_images: vine.boolean().optional(),
        schema_enabled: vine.boolean().optional(),
        indexnow_enabled: vine.boolean().optional(),
        indexnow_key_location: nullableText(2000),
        content_stale_days: vine.number().min(1).max(3650).withoutDecimals().optional(),
    }),
);

export const adminSeoListValidator = vine.compile(
    vine.object({
        page: vine.number().min(1).withoutDecimals().optional(),
        limit: vine.number().min(1).max(100).withoutDecimals().optional(),
        q: vine.string().trim().maxLength(180).optional(),
    }),
);
