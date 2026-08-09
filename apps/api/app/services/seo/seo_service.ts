import { Exception } from "@adonisjs/core/exceptions";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import type { SettingValueType } from "#models/setting";
import { analyzeSeoEvidence } from "#services/seo/analyzer";
import {
    buildEntitySchema,
    buildOrganizationSchema,
    buildRobotsDocument,
    filterSitemapEntries,
    type SitemapEntry,
    serializeRobots,
} from "#services/seo/builders";
import {
    DEFAULT_SEO_SETTINGS,
    SEO_ENTITY_KINDS,
    type SeoEngineProfile,
    type SeoEntityKind,
    type SeoEvidence,
    type SeoProfileInput,
    type SeoScoreResult,
    type SeoSiteSettings,
} from "#services/seo/domain";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;

export interface SeoEntityListInput {
    page?: number;
    limit?: number;
    q?: string;
    kind?: SeoEntityKind;
    locale?: "fa" | "en";
    status?: string;
    score_max?: number;
    issue_status?: "open" | "ignored" | "resolved" | "regressed";
    sort?: "updated_desc" | "score_asc" | "score_desc" | "title_asc";
}

export interface SeoProfileUpdateInput extends SeoProfileInput {
    expected_version?: number;
}

export interface SeoIssueListInput {
    page?: number;
    limit?: number;
    q?: string;
    severity?: "info" | "warning" | "critical";
    status?: "open" | "ignored" | "resolved" | "regressed";
    entity_kind?: SeoEntityKind;
    rule_code?: string;
}

export interface SeoKeywordInput {
    phrase: string;
    locale?: "fa" | "en";
    target_entity_kind?: SeoEntityKind | null;
    target_entity_id?: number | null;
    target_url?: string | null;
    search_engine?: string;
    country?: string | null;
    city?: string | null;
    device?: "desktop" | "mobile" | "tablet";
    current_position?: number | null;
    search_volume?: number | null;
    difficulty?: number | null;
    source?: string;
}

export interface SeoCompetitorInput {
    domain: string;
    label?: string | null;
    enabled?: boolean;
    source?: string;
    metrics?: Record<string, unknown>;
}

export interface SeoInternalLinkInput {
    source_kind: SeoEntityKind;
    source_key: string;
    target_kind: SeoEntityKind;
    target_key: string;
    anchor: string;
    relation?: string;
    status?: "suggested" | "approved" | "applied" | "rejected" | "removed";
    evidence?: Record<string, unknown>;
}

export interface SeoRedirectInput {
    source_path: string;
    target_path?: string | null;
    status_code?: 301 | 302 | 307 | 308 | 410;
    enabled?: boolean;
}

export interface SeoIntegrationInput {
    provider: "google_search_console" | "bing_webmaster" | "indexnow" | "google_merchant" | "openai_searchbot" | "manual_import";
    status?: "disconnected" | "configured" | "connected" | "error" | "disabled";
    configuration?: Record<string, unknown>;
    credential_env_ref?: string | null;
}

function numeric(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "boolean") return value;
    return value === "true" || value === 1 || value === "1";
}

function asJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback;
        }
    }
    return value as T;
}

function iso(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = DateTime.fromISO(String(value), { setZone: true });
    return parsed.isValid ? parsed.toUTC().toISO() : String(value);
}

function normalizedLocale(value: unknown): "fa" | "en" {
    return value === "en" ? "en" : "fa";
}

function normalizePath(value: string): string {
    const trimmed = value.trim();
    if (!trimmed.startsWith("/")) return `/${trimmed}`;
    return trimmed;
}

function stripHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function pagination(page = 1, limit = 25) {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

function paginated<T>(data: T[], total: number, page: number, limit: number) {
    return {
        data,
        meta: {
            total,
            per_page: limit,
            current_page: page,
            last_page: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

function entityKey(kind: SeoEntityKind, id: number | null, key?: string): string {
    if (key?.trim()) return key.trim();
    if (id !== null) return `${kind}:${id}`;
    throw new Exception("Entity key is required", { status: 422, code: "E_SEO_ENTITY_KEY_REQUIRED" });
}

function publicPath(kind: SeoEntityKind, slug: string | null, locale: string): string | null {
    if (!slug) return null;
    const prefix = locale === "fa" ? "/fa" : "";
    if (kind === "product") return `${prefix}/products/${slug}`;
    if (kind === "category") return `${prefix}/categories/${slug}`;
    if (kind === "brand") return `${prefix}/brands/${slug}`;
    if (kind === "content_post") return `${prefix}/mag/${slug}`;
    return null;
}

function absoluteUrl(base: string, path: string | null): string | null {
    if (!path || !base) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function serializeProfile(row: DbRow | null): SeoProfileInput & Record<string, unknown> {
    if (!row) return {};
    return {
        id: numeric(row.id),
        entityKind: String(row.entity_kind),
        entityId: nullableNumeric(row.entity_id),
        entityKey: String(row.entity_key ?? ""),
        locale: normalizedLocale(row.locale),
        engineProfile: row.engine_profile === "k21" ? "k21" : "k20",
        metaTitle: row.meta_title === null ? null : String(row.meta_title ?? ""),
        metaDescription: row.meta_description === null ? null : String(row.meta_description ?? ""),
        focusKeyword: row.focus_keyword === null ? null : String(row.focus_keyword ?? ""),
        secondaryKeywords: asJson<string[]>(row.secondary_keywords, []),
        canonicalUrl: row.canonical_url === null ? null : String(row.canonical_url ?? ""),
        robotsIndex: asBoolean(row.robots_index, true),
        robotsFollow: asBoolean(row.robots_follow, true),
        ogTitle: row.og_title === null ? null : String(row.og_title ?? ""),
        ogDescription: row.og_description === null ? null : String(row.og_description ?? ""),
        socialMediaId: nullableNumeric(row.social_media_id),
        schemaType: row.schema_type === null ? null : String(row.schema_type ?? ""),
        schemaOverrides: asJson<Record<string, unknown>>(row.schema_overrides, {}),
        scoreTotal: numeric(row.score_total),
        scoreTechnical: numeric(row.score_technical),
        scoreContent: numeric(row.score_content),
        scoreSchema: numeric(row.score_schema),
        scoreMedia: numeric(row.score_media),
        scoreCommerce: numeric(row.score_commerce),
        version: numeric(row.version),
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
    };
}

function serializeIssue(row: DbRow): Record<string, unknown> {
    return {
        id: numeric(row.id),
        profile_id: nullableNumeric(row.profile_id),
        audit_run_id: nullableNumeric(row.audit_run_id),
        entity_kind: String(row.entity_kind),
        entity_id: nullableNumeric(row.entity_id),
        entity_key: String(row.entity_key),
        locale: normalizedLocale(row.locale),
        rule_code: String(row.rule_code),
        severity: String(row.severity),
        status: String(row.status),
        title: String(row.title),
        description: String(row.description),
        evidence: asJson<Record<string, unknown>>(row.evidence, {}),
        suggested_fix: asJson<Record<string, unknown>>(row.suggested_fix, {}),
        first_seen_at: iso(row.first_seen_at),
        last_seen_at: iso(row.last_seen_at),
        resolved_at: iso(row.resolved_at),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
    };
}

const SEO_SETTING_TYPES: Record<keyof SeoSiteSettings, SettingValueType> = {
    engine_profile: "string",
    base_url: "string",
    default_locale: "string",
    title_separator: "string",
    organization_name: "string",
    organization_logo_url: "string",
    robots_enabled: "boolean",
    robots_allow_all: "boolean",
    robots_disallow: "json",
    openai_searchbot_allowed: "boolean",
    sitemap_enabled: "boolean",
    sitemap_products: "boolean",
    sitemap_categories: "boolean",
    sitemap_brands: "boolean",
    sitemap_content: "boolean",
    sitemap_images: "boolean",
    schema_enabled: "boolean",
    indexnow_enabled: "boolean",
    indexnow_key_location: "string",
    content_stale_days: "number",
};

export class SeoService {
    private settingsService = new SettingsService();

    async settings(): Promise<SeoSiteSettings> {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const [stored, tenant, primaryDomain] = await Promise.all([
            this.settingsService.all("seo"),
            trx.from("tenants").where("id", String(tenantId)).select("name", "primary_locale", "attributes").first(),
            trx
                .from("tenant_domains")
                .where("tenant_id", String(tenantId))
                .where("is_primary", true)
                .where("tls_status", "active")
                .select("domain")
                .first(),
        ]);
        const tenantAttributes = asJson<Record<string, unknown>>(tenant?.attributes, {});
        const domain = primaryDomain?.domain ? String(primaryDomain.domain) : "";
        const baseUrl =
            typeof stored.base_url === "string" && stored.base_url.trim()
                ? stored.base_url.trim().replace(/\/+$/, "")
                : domain
                  ? `https://${domain}`
                  : "";
        const organizationName =
            typeof stored.organization_name === "string" && stored.organization_name.trim()
                ? stored.organization_name.trim()
                : String(tenant?.name ?? DEFAULT_SEO_SETTINGS.organization_name);
        const organizationLogo =
            typeof stored.organization_logo_url === "string" && stored.organization_logo_url.trim()
                ? stored.organization_logo_url.trim()
                : typeof tenantAttributes.logo_url === "string"
                  ? tenantAttributes.logo_url
                  : null;
        return {
            ...DEFAULT_SEO_SETTINGS,
            ...stored,
            base_url: baseUrl,
            organization_name: organizationName,
            organization_logo_url: organizationLogo,
            engine_profile: stored.engine_profile === "k21" ? "k21" : "k20",
            default_locale:
                stored.default_locale === "en" || (stored.default_locale === undefined && tenant?.primary_locale === "en")
                    ? "en"
                    : "fa",
            robots_disallow: Array.isArray(stored.robots_disallow)
                ? stored.robots_disallow.map(String)
                : DEFAULT_SEO_SETTINGS.robots_disallow,
        } as SeoSiteSettings;
    }

    async updateSettings(input: Partial<SeoSiteSettings>): Promise<{ data: SeoSiteSettings; changed: boolean }> {
        const current = await this.settings();
        let changed = false;
        for (const key of Object.keys(input) as Array<keyof SeoSiteSettings>) {
            const next = input[key];
            if (next === undefined) continue;
            if (JSON.stringify(current[key]) === JSON.stringify(next)) continue;
            await this.settingsService.set("seo", key, next, SEO_SETTING_TYPES[key]);
            changed = true;
        }
        return { data: await this.settings(), changed };
    }

    async overview(locale: "fa" | "en" = "fa") {
        const trx = currentTrx();
        const [
            settings,
            productCount,
            contentCount,
            mediaCount,
            contentImpact,
            profileStats,
            issueStats,
            keywordStats,
            audit,
            integrations,
        ] = await Promise.all([
            this.settings(),
            trx.from("products").whereNull("deleted_at").count("id as count").first(),
            trx.from("content_posts").whereNull("deleted_at").count("id as count").first(),
            trx.from("media").count("id as count").first(),
            trx
                .from("content_posts")
                .whereNull("deleted_at")
                .select(
                    trx.raw("COALESCE(SUM(views_count), 0)::bigint AS views"),
                    trx.raw("COALESCE(SUM(product_clicks_count), 0)::bigint AS product_clicks"),
                    trx.raw("COALESCE(SUM(assisted_orders_count), 0)::bigint AS assisted_orders"),
                    trx.raw("COALESCE(SUM(assisted_revenue_minor), 0)::bigint AS assisted_revenue_minor"),
                )
                .first(),
            trx
                .from("seo_entity_profiles")
                .where("locale", locale)
                .select(
                    trx.raw("COUNT(*)::int AS total"),
                    trx.raw("COALESCE(ROUND(AVG(score_total)), 0)::int AS average_score"),
                    trx.raw("COUNT(*) FILTER (WHERE score_total >= 85)::int AS healthy"),
                    trx.raw("COUNT(*) FILTER (WHERE score_total < 60)::int AS critical"),
                )
                .first(),
            trx
                .from("seo_issues")
                .select(
                    trx.raw("COUNT(*) FILTER (WHERE status IN ('open','regressed'))::int AS open"),
                    trx.raw("COUNT(*) FILTER (WHERE status IN ('open','regressed') AND severity = 'critical')::int AS critical"),
                    trx.raw("COUNT(*) FILTER (WHERE status IN ('open','regressed') AND severity = 'warning')::int AS warning"),
                    trx.raw("COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved"),
                )
                .first(),
            trx
                .from("seo_keywords")
                .select(
                    trx.raw("COUNT(*)::int AS total"),
                    trx.raw("COUNT(*) FILTER (WHERE current_position BETWEEN 1 AND 10)::int AS top_ten"),
                    trx.raw(
                        "COUNT(*) FILTER (WHERE previous_position IS NOT NULL AND current_position < previous_position)::int AS improved",
                    ),
                    trx.raw(
                        "COUNT(*) FILTER (WHERE previous_position IS NOT NULL AND current_position > previous_position)::int AS declined",
                    ),
                )
                .first(),
            trx.from("seo_audit_runs").orderBy("created_at", "desc").first(),
            trx.from("seo_integrations").select("provider", "status", "last_synced_at", "last_error").orderBy("provider", "asc"),
        ]);

        const uncovered =
            numeric(productCount?.count) +
            numeric(contentCount?.count) +
            numeric(mediaCount?.count) -
            numeric(profileStats?.total);
        return {
            data: {
                engine_profile: settings.engine_profile,
                entities: {
                    products: numeric(productCount?.count),
                    content_posts: numeric(contentCount?.count),
                    media: numeric(mediaCount?.count),
                    analyzed: numeric(profileStats?.total),
                    unanalyzed: Math.max(0, uncovered),
                },
                health: {
                    average_score: numeric(profileStats?.average_score),
                    healthy: numeric(profileStats?.healthy),
                    critical: numeric(profileStats?.critical),
                },
                issues: {
                    open: numeric(issueStats?.open),
                    critical: numeric(issueStats?.critical),
                    warning: numeric(issueStats?.warning),
                    resolved: numeric(issueStats?.resolved),
                },
                keywords: {
                    total: numeric(keywordStats?.total),
                    top_ten: numeric(keywordStats?.top_ten),
                    improved: numeric(keywordStats?.improved),
                    declined: numeric(keywordStats?.declined),
                },
                content_impact: {
                    views: numeric(contentImpact?.views),
                    product_clicks: numeric(contentImpact?.product_clicks),
                    assisted_orders: numeric(contentImpact?.assisted_orders),
                    assisted_revenue_minor: numeric(contentImpact?.assisted_revenue_minor),
                },
                last_audit: audit
                    ? {
                          id: numeric(audit.id),
                          kind: audit.kind,
                          status: audit.status,
                          started_at: iso(audit.started_at),
                          completed_at: iso(audit.completed_at),
                          counters: asJson(audit.counters, {}),
                      }
                    : null,
                integrations: integrations.map((row) => ({
                    provider: row.provider,
                    status: row.status,
                    last_synced_at: iso(row.last_synced_at),
                    last_error: row.last_error,
                })),
            },
        };
    }

    async listEntities(input: SeoEntityListInput) {
        const { page, limit, offset } = pagination(input.page, input.limit);
        const settings = await this.settings();
        const locale = input.locale ?? settings.default_locale;
        const evidence = await this.collectEvidence(input.kind, locale);
        let issueKeys: Set<string> | null = null;
        if (input.issue_status) {
            const issueQuery = currentTrx().from("seo_issues").where("locale", locale).where("status", input.issue_status);
            if (input.kind) issueQuery.where("entity_kind", input.kind);
            const issueRows = (await issueQuery.select("entity_key")) as DbRow[];
            issueKeys = new Set(issueRows.map((row) => String(row.entity_key)));
        }
        const filtered = evidence.filter((item) => {
            if (input.q) {
                const haystack = `${item.title ?? ""} ${item.slug ?? ""} ${item.sku ?? ""}`.toLocaleLowerCase();
                if (!haystack.includes(input.q.toLocaleLowerCase())) return false;
            }
            if (input.status && item.status !== input.status) return false;
            if (issueKeys && !issueKeys.has(item.key)) return false;
            const score = analyzeSeoEvidence(item, item.profile?.engineProfile ?? settings.engine_profile).total;
            if (input.score_max !== undefined && score > input.score_max) return false;
            return true;
        });
        const ordered = filtered.sort((a, b) => {
            const aScore = analyzeSeoEvidence(a, a.profile?.engineProfile ?? settings.engine_profile).total;
            const bScore = analyzeSeoEvidence(b, b.profile?.engineProfile ?? settings.engine_profile).total;
            if (input.sort === "score_desc") return bScore - aScore;
            if (input.sort === "title_asc") return String(a.title ?? "").localeCompare(String(b.title ?? ""), locale);
            if (input.sort === "updated_desc") return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
            return aScore - bScore;
        });
        const slice = ordered.slice(offset, offset + limit);
        const data = slice.map((item) =>
            this.serializeEntity(item, analyzeSeoEvidence(item, item.profile?.engineProfile ?? settings.engine_profile)),
        );
        return paginated(data, ordered.length, page, limit);
    }

    async entity(kind: SeoEntityKind, id: number, locale: "fa" | "en" = "fa") {
        const settings = await this.settings();
        const evidence = await this.loadEvidence(kind, id, locale);
        const score = analyzeSeoEvidence(evidence, evidence.profile?.engineProfile ?? settings.engine_profile);
        const schema = buildEntitySchema(evidence, settings);
        const issues = await currentTrx()
            .from("seo_issues")
            .where("entity_kind", kind)
            .where("entity_key", evidence.key)
            .where("locale", locale)
            .orderByRaw("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END")
            .orderBy("rule_code", "asc");
        return {
            data: {
                ...this.serializeEntity(evidence, score),
                evidence,
                schema,
                issues: issues.map(serializeIssue),
            },
        };
    }

    async updateProfile(
        kind: SeoEntityKind,
        id: number,
        locale: "fa" | "en",
        input: SeoProfileUpdateInput,
        actorId: number | null,
    ) {
        const trx = currentTrx();
        const evidence = await this.loadEvidence(kind, id, locale);
        const existing = await trx
            .from("seo_entity_profiles")
            .where("entity_kind", kind)
            .where("entity_key", evidence.key)
            .where("locale", locale)
            .first();
        if (existing && input.expected_version !== undefined && numeric(existing.version) !== input.expected_version) {
            throw new Exception("SEO profile was changed by another operator", {
                status: 409,
                code: "E_SEO_PROFILE_VERSION_CONFLICT",
            });
        }
        const now = DateTime.utc().toSQL();
        const values = {
            tenant_id: currentTenantId(),
            entity_kind: kind,
            entity_id: id,
            entity_key: evidence.key,
            locale,
            engine_profile: input.engineProfile ?? existing?.engine_profile ?? "k20",
            meta_title: input.metaTitle === undefined ? (existing?.meta_title ?? null) : input.metaTitle,
            meta_description: input.metaDescription === undefined ? (existing?.meta_description ?? null) : input.metaDescription,
            focus_keyword: input.focusKeyword === undefined ? (existing?.focus_keyword ?? null) : input.focusKeyword,
            secondary_keywords: JSON.stringify(input.secondaryKeywords ?? asJson(existing?.secondary_keywords, [])),
            canonical_url: input.canonicalUrl === undefined ? (existing?.canonical_url ?? null) : input.canonicalUrl,
            robots_index: input.robotsIndex ?? asBoolean(existing?.robots_index, true),
            robots_follow: input.robotsFollow ?? asBoolean(existing?.robots_follow, true),
            og_title: input.ogTitle === undefined ? (existing?.og_title ?? null) : input.ogTitle,
            og_description: input.ogDescription === undefined ? (existing?.og_description ?? null) : input.ogDescription,
            social_media_id: input.socialMediaId === undefined ? (existing?.social_media_id ?? null) : input.socialMediaId,
            schema_type: input.schemaType === undefined ? (existing?.schema_type ?? null) : input.schemaType,
            schema_overrides: JSON.stringify(input.schemaOverrides ?? asJson(existing?.schema_overrides, {})),
            version: existing ? numeric(existing.version) + 1 : 1,
            created_by_user_id: existing?.created_by_user_id ?? actorId,
            updated_by_user_id: actorId,
            created_at: existing?.created_at ?? now,
            updated_at: now,
        };
        await trx
            .table("seo_entity_profiles")
            .insert(values)
            .onConflict(["tenant_id", "entity_kind", "entity_key", "locale"])
            .merge([
                "entity_id",
                "engine_profile",
                "meta_title",
                "meta_description",
                "focus_keyword",
                "secondary_keywords",
                "canonical_url",
                "robots_index",
                "robots_follow",
                "og_title",
                "og_description",
                "social_media_id",
                "schema_type",
                "schema_overrides",
                "version",
                "updated_by_user_id",
                "updated_at",
            ]);
        await this.auditEntity(kind, id, locale, actorId, "entity");
        await this.event("profile.updated", kind, evidence.key, actorId, { version: values.version });
        return this.entity(kind, id, locale);
    }

    async auditEntity(
        kind: SeoEntityKind,
        id: number,
        locale: "fa" | "en",
        actorId: number | null,
        auditKind: "entity" | "full" | "technical" | "crawl" | "schema" | "content" | "media" = "entity",
    ) {
        const trx = currentTrx();
        const settings = await this.settings();
        const now = DateTime.utc().toSQL();
        const runRows = await trx
            .table("seo_audit_runs")
            .insert({
                tenant_id: currentTenantId(),
                kind: auditKind,
                status: "running",
                engine_profile: settings.engine_profile,
                scope: JSON.stringify({ kind, id, locale }),
                counters: JSON.stringify({ entities: 1 }),
                result_summary: JSON.stringify({}),
                requested_by_user_id: actorId,
                started_at: now,
                created_at: now,
                updated_at: now,
            })
            .returning("id");
        const auditRunId = numeric((runRows[0] as DbRow | undefined)?.id ?? runRows[0]);
        try {
            const evidence = await this.loadEvidence(kind, id, locale);
            const result = analyzeSeoEvidence(evidence, evidence.profile?.engineProfile ?? settings.engine_profile);
            const profileId = await this.persistAuditResult(trx, evidence, result, auditRunId, actorId);
            await trx
                .from("seo_audit_runs")
                .where("id", auditRunId)
                .update({
                    status: "completed",
                    counters: JSON.stringify({ entities: 1, issues: result.issues.length }),
                    result_summary: JSON.stringify({ score: result.total, profile_id: profileId }),
                    completed_at: DateTime.utc().toSQL(),
                    updated_at: DateTime.utc().toSQL(),
                });
            await this.event("audit.completed", kind, evidence.key, actorId, {
                audit_run_id: auditRunId,
                score: result.total,
                issues: result.issues.length,
            });
            return { data: { id: auditRunId, status: "completed", score: result, profile_id: profileId } };
        } catch (error) {
            await trx
                .from("seo_audit_runs")
                .where("id", auditRunId)
                .update({
                    status: "failed",
                    error_message: error instanceof Error ? error.message : String(error),
                    completed_at: DateTime.utc().toSQL(),
                    updated_at: DateTime.utc().toSQL(),
                });
            throw error;
        }
    }

    async auditAll(
        input: { kinds?: SeoEntityKind[]; locale?: "fa" | "en"; engine_profile?: SeoEngineProfile },
        actorId: number | null,
    ) {
        const trx = currentTrx();
        const settings = await this.settings();
        const locale = input.locale ?? settings.default_locale;
        const profile = input.engine_profile ?? settings.engine_profile;
        const kinds = input.kinds?.length ? input.kinds : SEO_ENTITY_KINDS.filter((item) => item !== "page");
        const now = DateTime.utc().toSQL();
        const runRows = await trx
            .table("seo_audit_runs")
            .insert({
                tenant_id: currentTenantId(),
                kind: "full",
                status: "running",
                engine_profile: profile,
                scope: JSON.stringify({ kinds, locale }),
                counters: JSON.stringify({ entities: 0 }),
                result_summary: JSON.stringify({}),
                requested_by_user_id: actorId,
                started_at: now,
                created_at: now,
                updated_at: now,
            })
            .returning("id");
        const auditRunId = numeric((runRows[0] as DbRow | undefined)?.id ?? runRows[0]);
        const counters = { entities: 0, issues: 0, critical: 0, warning: 0, healthy: 0 };
        try {
            for (const kind of kinds) {
                const entities = await this.collectEvidence(kind, locale);
                for (const evidence of entities) {
                    const result = analyzeSeoEvidence(evidence, evidence.profile?.engineProfile ?? profile);
                    await this.persistAuditResult(trx, evidence, result, auditRunId, actorId);
                    counters.entities += 1;
                    counters.issues += result.issues.length;
                    counters.critical += result.issues.filter((item) => item.severity === "critical").length;
                    counters.warning += result.issues.filter((item) => item.severity === "warning").length;
                    if (result.total >= 85) counters.healthy += 1;
                }
            }
            await trx
                .from("seo_audit_runs")
                .where("id", auditRunId)
                .update({
                    status: "completed",
                    counters: JSON.stringify(counters),
                    result_summary: JSON.stringify({ average_score: await this.averageScore() }),
                    completed_at: DateTime.utc().toSQL(),
                    updated_at: DateTime.utc().toSQL(),
                });
            await this.event("audit.full.completed", null, null, actorId, { audit_run_id: auditRunId, ...counters });
            return { data: { id: auditRunId, status: "completed", counters } };
        } catch (error) {
            await trx
                .from("seo_audit_runs")
                .where("id", auditRunId)
                .update({
                    status: "failed",
                    error_message: error instanceof Error ? error.message : String(error),
                    counters: JSON.stringify(counters),
                    completed_at: DateTime.utc().toSQL(),
                    updated_at: DateTime.utc().toSQL(),
                });
            throw error;
        }
    }

    async listIssues(input: SeoIssueListInput) {
        const trx = currentTrx();
        const { page, limit, offset } = pagination(input.page, input.limit);
        const base = trx.from("seo_issues");
        if (input.severity) base.where("severity", input.severity);
        if (input.status) base.where("status", input.status);
        if (input.entity_kind) base.where("entity_kind", input.entity_kind);
        if (input.rule_code) base.where("rule_code", input.rule_code);
        if (input.q) {
            const escaped = input.q.replace(/[\\%_]/g, "\\$&");
            base.where((query) => query.whereILike("title", `%${escaped}%`).orWhereILike("description", `%${escaped}%`));
        }
        const countRow = await base.clone().clearSelect().clearOrder().count("id as count").first();
        const rows = await base
            .clone()
            .orderByRaw("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END")
            .orderBy("last_seen_at", "desc")
            .offset(offset)
            .limit(limit);
        return paginated(rows.map(serializeIssue), numeric(countRow?.count), page, limit);
    }

    async updateIssueStatus(issueId: number, status: "open" | "ignored" | "resolved" | "regressed", actorId: number | null) {
        const trx = currentTrx();
        const issue = await trx.from("seo_issues").where("id", issueId).first();
        if (!issue) throw new Exception("SEO issue not found", { status: 404, code: "E_SEO_ISSUE_NOT_FOUND" });
        const resolved = status === "resolved";
        await trx
            .from("seo_issues")
            .where("id", issueId)
            .update({
                status,
                resolved_at: resolved ? DateTime.utc().toSQL() : null,
                resolved_by_user_id: resolved ? actorId : null,
                updated_at: DateTime.utc().toSQL(),
            });
        await this.event("issue.status.updated", String(issue.entity_kind) as SeoEntityKind, String(issue.entity_key), actorId, {
            issue_id: issueId,
            status,
        });
        return { data: serializeIssue({ ...issue, status, resolved_at: resolved ? DateTime.utc().toISO() : null }) };
    }

    async listKeywords(input: { page?: number; limit?: number; q?: string } = {}) {
        return this.listSimple("seo_keywords", input, ["phrase", "target_url"], "created_at");
    }

    async createKeyword(input: SeoKeywordInput, actorId: number | null) {
        const trx = currentTrx();
        const now = DateTime.utc().toSQL();
        const rows = await trx
            .table("seo_keywords")
            .insert({
                tenant_id: currentTenantId(),
                phrase: input.phrase.trim(),
                locale: input.locale ?? "fa",
                target_entity_kind: input.target_entity_kind ?? null,
                target_entity_id: input.target_entity_id ?? null,
                target_url: input.target_url ?? null,
                search_engine: input.search_engine ?? "google",
                country: input.country ?? null,
                city: input.city ?? null,
                device: input.device ?? "desktop",
                current_position: input.current_position ?? null,
                previous_position: null,
                best_position: input.current_position ?? null,
                search_volume: input.search_volume ?? null,
                difficulty: input.difficulty ?? null,
                source: input.source ?? "manual",
                last_checked_at: input.current_position ? now : null,
                created_by_user_id: actorId,
                created_at: now,
                updated_at: now,
            })
            .returning("*");
        await this.event("keyword.created", null, null, actorId, { keyword_id: numeric((rows[0] as DbRow).id) });
        return { data: rows[0] };
    }

    async updateKeyword(id: number, input: Partial<SeoKeywordInput>, actorId: number | null) {
        const trx = currentTrx();
        const row = await trx.from("seo_keywords").where("id", id).first();
        if (!row) throw new Exception("SEO keyword not found", { status: 404, code: "E_SEO_KEYWORD_NOT_FOUND" });
        const currentPosition = nullableNumeric(row.current_position);
        const nextPosition = input.current_position === undefined ? currentPosition : input.current_position;
        const update: Record<string, unknown> = { updated_at: DateTime.utc().toSQL() };
        const directFields = [
            "phrase",
            "locale",
            "target_entity_kind",
            "target_entity_id",
            "target_url",
            "search_engine",
            "country",
            "city",
            "device",
            "search_volume",
            "difficulty",
            "source",
        ] as const;
        for (const field of directFields) {
            if (input[field] !== undefined) update[field] = input[field];
        }
        if (input.phrase !== undefined) update.phrase = input.phrase.trim();
        if (input.current_position !== undefined) {
            update.current_position = input.current_position;
            update.previous_position = input.current_position !== currentPosition ? currentPosition : row.previous_position;
            update.best_position =
                nextPosition === null
                    ? row.best_position
                    : Math.min(nullableNumeric(row.best_position) ?? nextPosition, nextPosition);
            update.last_checked_at = DateTime.utc().toSQL();
        }
        await trx.from("seo_keywords").where("id", id).update(update);
        await this.event("keyword.updated", null, null, actorId, { keyword_id: id });
        return { data: await trx.from("seo_keywords").where("id", id).first() };
    }

    async deleteKeyword(id: number, actorId: number | null) {
        const deleted = await currentTrx().from("seo_keywords").where("id", id).delete();
        if (!numeric(deleted)) throw new Exception("SEO keyword not found", { status: 404, code: "E_SEO_KEYWORD_NOT_FOUND" });
        await this.event("keyword.deleted", null, null, actorId, { keyword_id: id });
    }

    async listCompetitors(input: { page?: number; limit?: number; q?: string } = {}) {
        return this.listSimple("seo_competitors", input, ["domain", "label"], "updated_at");
    }

    async saveCompetitor(id: number | null, input: SeoCompetitorInput, actorId: number | null) {
        const trx = currentTrx();
        const now = DateTime.utc().toSQL();
        const values = {
            tenant_id: currentTenantId(),
            domain: input.domain
                .toLowerCase()
                .replace(/^https?:\/\//, "")
                .replace(/\/$/, ""),
            label: input.label ?? null,
            enabled: input.enabled ?? true,
            source: input.source ?? "manual",
            metrics: JSON.stringify(input.metrics ?? {}),
            updated_at: now,
        };
        let row: DbRow | undefined;
        if (id) {
            const changed = await trx.from("seo_competitors").where("id", id).update(values).returning("*");
            row = changed[0] as DbRow | undefined;
            if (!row) throw new Exception("SEO competitor not found", { status: 404, code: "E_SEO_COMPETITOR_NOT_FOUND" });
        } else {
            const created = await trx
                .table("seo_competitors")
                .insert({ ...values, created_at: now })
                .returning("*");
            row = created[0] as DbRow | undefined;
        }
        const competitorId = numeric(row?.id ?? id);
        await this.event(id ? "competitor.updated" : "competitor.created", null, null, actorId, { competitor_id: competitorId });
        return { data: row };
    }

    async deleteCompetitor(id: number, actorId: number | null) {
        const deleted = await currentTrx().from("seo_competitors").where("id", id).delete();
        if (!numeric(deleted))
            throw new Exception("SEO competitor not found", { status: 404, code: "E_SEO_COMPETITOR_NOT_FOUND" });
        await this.event("competitor.deleted", null, null, actorId, { competitor_id: id });
    }

    async listInternalLinks(input: { page?: number; limit?: number; q?: string } = {}) {
        return this.listSimple("seo_internal_links", input, ["anchor", "source_key", "target_key"], "updated_at");
    }

    async saveInternalLink(id: number | null, input: SeoInternalLinkInput, actorId: number | null) {
        const trx = currentTrx();
        const now = DateTime.utc().toSQL();
        const values = {
            tenant_id: currentTenantId(),
            source_kind: input.source_kind,
            source_key: input.source_key.trim(),
            target_kind: input.target_kind,
            target_key: input.target_key.trim(),
            anchor: input.anchor.trim(),
            relation: input.relation ?? "related",
            status: input.status ?? "suggested",
            evidence: JSON.stringify(input.evidence ?? {}),
            created_by_user_id: actorId,
            applied_by_user_id: input.status === "applied" ? actorId : null,
            applied_at: input.status === "applied" ? now : null,
            updated_at: now,
        };
        let row: DbRow | undefined;
        if (id) {
            const changed = await trx.from("seo_internal_links").where("id", id).update(values).returning("*");
            row = changed[0] as DbRow | undefined;
            if (!row) throw new Exception("SEO link not found", { status: 404, code: "E_SEO_LINK_NOT_FOUND" });
        } else {
            const created = await trx
                .table("seo_internal_links")
                .insert({ ...values, created_at: now })
                .returning("*");
            row = created[0] as DbRow | undefined;
        }
        const linkId = numeric(row?.id ?? id);
        await this.event(id ? "link.updated" : "link.created", input.source_kind, input.source_key, actorId, { link_id: linkId });
        return { data: row };
    }

    async deleteInternalLink(id: number, actorId: number | null) {
        const deleted = await currentTrx().from("seo_internal_links").where("id", id).delete();
        if (!numeric(deleted)) throw new Exception("SEO link not found", { status: 404, code: "E_SEO_LINK_NOT_FOUND" });
        await this.event("link.deleted", null, null, actorId, { link_id: id });
    }

    async listRedirects(input: { page?: number; limit?: number; q?: string } = {}) {
        return this.listSimple("seo_redirects", input, ["source_path", "target_path"], "updated_at");
    }

    async saveRedirect(id: number | null, input: SeoRedirectInput, actorId: number | null) {
        const trx = currentTrx();
        const now = DateTime.utc().toSQL();
        const statusCode = input.status_code ?? 301;
        const values = {
            tenant_id: currentTenantId(),
            source_path: normalizePath(input.source_path),
            target_path: statusCode === 410 ? null : input.target_path ? normalizePath(input.target_path) : null,
            status_code: statusCode,
            enabled: input.enabled ?? true,
            created_by_user_id: actorId,
            updated_at: now,
        };
        if (values.status_code !== 410 && !values.target_path) {
            throw new Exception("Redirect target is required", { status: 422, code: "E_SEO_REDIRECT_TARGET_REQUIRED" });
        }
        if (values.target_path === values.source_path) {
            throw new Exception("Redirect source and target must differ", { status: 422, code: "E_SEO_REDIRECT_LOOP" });
        }
        let row: DbRow | undefined;
        if (id) {
            const changed = await trx.from("seo_redirects").where("id", id).update(values).returning("*");
            row = changed[0] as DbRow | undefined;
            if (!row) throw new Exception("SEO redirect not found", { status: 404, code: "E_SEO_REDIRECT_NOT_FOUND" });
        } else {
            const created = await trx
                .table("seo_redirects")
                .insert({ ...values, hit_count: 0, created_at: now })
                .returning("*");
            row = created[0] as DbRow | undefined;
        }
        const redirectId = numeric(row?.id ?? id);
        await this.event(id ? "redirect.updated" : "redirect.created", null, null, actorId, { redirect_id: redirectId });
        return { data: row };
    }

    async deleteRedirect(id: number, actorId: number | null) {
        const deleted = await currentTrx().from("seo_redirects").where("id", id).delete();
        if (!numeric(deleted)) throw new Exception("SEO redirect not found", { status: 404, code: "E_SEO_REDIRECT_NOT_FOUND" });
        await this.event("redirect.deleted", null, null, actorId, { redirect_id: id });
    }

    async integrations() {
        const trx = currentTrx();
        const providers = [
            "google_search_console",
            "bing_webmaster",
            "indexnow",
            "google_merchant",
            "openai_searchbot",
            "manual_import",
        ];
        const rows = await trx.from("seo_integrations");
        const map = new Map(rows.map((row) => [String(row.provider), row]));
        return {
            data: providers.map((provider) => {
                const row = map.get(provider);
                return row
                    ? {
                          ...row,
                          configuration: asJson<Record<string, unknown>>(row.configuration, {}),
                          credential_env_ref: row.credential_env_ref,
                          credential_configured:
                              typeof row.credential_env_ref === "string" && Boolean(process.env[String(row.credential_env_ref)]),
                      }
                    : {
                          provider,
                          status: "disconnected",
                          configuration: {},
                          credential_env_ref: null,
                          credential_configured: false,
                      };
            }),
        };
    }

    async saveIntegration(input: SeoIntegrationInput, actorId: number | null) {
        const trx = currentTrx();
        const now = DateTime.utc().toSQL();
        const values = {
            tenant_id: currentTenantId(),
            provider: input.provider,
            status: input.status ?? "configured",
            configuration: JSON.stringify(input.configuration ?? {}),
            credential_env_ref: input.credential_env_ref ?? null,
            last_error: null,
            updated_at: now,
        };
        await trx
            .table("seo_integrations")
            .insert({ ...values, created_at: now })
            .onConflict(["tenant_id", "provider"])
            .merge(["status", "configuration", "credential_env_ref", "last_error", "updated_at"]);
        await this.event("integration.updated", null, null, actorId, { provider: input.provider, status: values.status });
        return { data: await trx.from("seo_integrations").where("provider", input.provider).first() };
    }

    async submitIndexNow(input: { urls?: string[] }, actorId: number | null) {
        const trx = currentTrx();
        const settings = await this.settings();
        if (!settings.indexnow_enabled) {
            throw new Exception("IndexNow is disabled", { status: 422, code: "E_SEO_INDEXNOW_DISABLED" });
        }
        if (!settings.base_url) {
            throw new Exception("SEO base URL is required", { status: 422, code: "E_SEO_BASE_URL_REQUIRED" });
        }
        const integration = await trx.from("seo_integrations").where("provider", "indexnow").first();
        const envRef = integration?.credential_env_ref ? String(integration.credential_env_ref) : "";
        const key = envRef ? process.env[envRef] : undefined;
        if (!key) {
            throw new Exception("IndexNow credential environment variable is not configured", {
                status: 422,
                code: "E_SEO_INDEXNOW_CREDENTIAL_MISSING",
            });
        }
        const configuration = asJson<Record<string, unknown>>(integration?.configuration, {});
        const endpoint =
            typeof configuration.endpoint === "string" && configuration.endpoint.trim()
                ? configuration.endpoint.trim()
                : "https://api.indexnow.org/indexnow";
        const base = new URL(settings.base_url);
        const candidates = input.urls?.length
            ? input.urls
            : (await Promise.all([this.sitemapEntries("fa"), this.sitemapEntries("en")])).flat().map((entry) => entry.url);
        const urlList = [
            ...new Set(
                candidates
                    .map((value) => {
                        try {
                            return new URL(value, base).toString();
                        } catch {
                            return null;
                        }
                    })
                    .filter((value): value is string => Boolean(value))
                    .filter((value) => new URL(value).host === base.host),
            ),
        ].slice(0, 10_000);
        if (!urlList.length) {
            throw new Exception("No valid same-host URLs were supplied", { status: 422, code: "E_SEO_INDEXNOW_URLS_EMPTY" });
        }
        const keyLocation = settings.indexnow_key_location
            ? new URL(settings.indexnow_key_location, base).toString()
            : typeof configuration.key_location === "string" && configuration.key_location.trim()
              ? new URL(configuration.key_location, base).toString()
              : undefined;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json; charset=utf-8" },
                body: JSON.stringify({
                    host: base.host,
                    key,
                    ...(keyLocation ? { keyLocation } : {}),
                    urlList,
                }),
                signal: controller.signal,
            });
            if (!response.ok && response.status !== 202) {
                const detail = (await response.text()).slice(0, 1000);
                throw new Error(`IndexNow returned ${response.status}${detail ? `: ${detail}` : ""}`);
            }
            const now = DateTime.utc().toSQL();
            await trx
                .from("seo_integrations")
                .where("provider", "indexnow")
                .update({ status: "connected", last_synced_at: now, last_error: null, updated_at: now });
            await this.event("indexnow.submitted", null, null, actorId, { count: urlList.length, endpoint });
            return { data: { accepted: true, count: urlList.length, status_code: response.status, submitted_at: iso(now) } };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const now = DateTime.utc().toSQL();
            await trx
                .from("seo_integrations")
                .where("provider", "indexnow")
                .update({ status: "error", last_error: message, updated_at: now });
            throw new Exception("IndexNow submission failed", {
                status: 502,
                code: "E_SEO_INDEXNOW_FAILED",
                cause: error,
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    async robotsPreview() {
        const settings = await this.settings();
        const document = buildRobotsDocument(settings);
        return { data: { document, text: serializeRobots(document) } };
    }

    async sitemapPreview(locale?: "fa" | "en") {
        const settings = await this.settings();
        const entries = await this.sitemapEntries(locale ?? settings.default_locale);
        const counts = entries.reduce<Record<string, number>>((acc, item) => {
            const kind = String((item as SitemapEntry & { kind?: string }).kind ?? "page");
            acc[kind] = (acc[kind] ?? 0) + 1;
            return acc;
        }, {});
        return { data: { entries, counts, total: entries.length } };
    }

    async sitemapEntries(locale: "fa" | "en"): Promise<Array<SitemapEntry & { kind: SeoEntityKind }>> {
        const settings = await this.settings();
        if (!settings.sitemap_enabled || !settings.base_url) return [];
        const enabledKinds: SeoEntityKind[] = [];
        if (settings.sitemap_products) enabledKinds.push("product");
        if (settings.sitemap_categories) enabledKinds.push("category");
        if (settings.sitemap_brands) enabledKinds.push("brand");
        if (settings.sitemap_content) enabledKinds.push("content_post");
        const evidence = (await Promise.all(enabledKinds.map((kind) => this.collectEvidence(kind, locale)))).flat();
        const entries = evidence
            .filter(
                (item) =>
                    (item.status === "publish" ||
                        item.status === "published" ||
                        item.kind === "category" ||
                        item.kind === "brand") &&
                    item.profile?.robotsIndex !== false &&
                    ((item.kind !== "category" && item.kind !== "brand") || (item.productCount ?? 0) > 0),
            )
            .map((item) => ({
                kind: item.kind,
                url: item.profile?.canonicalUrl || item.publicUrl || "",
                lastModified: item.updatedAt,
                changeFrequency: item.kind === "product" ? ("weekly" as const) : ("monthly" as const),
                priority: item.kind === "product" ? 0.8 : 0.6,
                images: settings.sitemap_images ? (item.imageUrls ?? (item.featuredImageUrl ? [item.featuredImageUrl] : [])) : [],
            }));
        const valid = filterSitemapEntries(entries);
        const kindByUrl = new Map(entries.map((entry) => [entry.url, entry.kind]));
        return valid.map((entry) => ({ ...entry, kind: kindByUrl.get(entry.url) ?? "page" }));
    }

    async schemaPreview(kind: SeoEntityKind, id: number, locale: "fa" | "en") {
        const settings = await this.settings();
        const evidence = await this.loadEvidence(kind, id, locale);
        return {
            data: {
                entity: evidence,
                schema: buildEntitySchema(evidence, settings),
                organization: buildOrganizationSchema(settings),
            },
        };
    }

    async publicEntity(kind: SeoEntityKind, id: number, locale: "fa" | "en") {
        const settings = await this.settings();
        const evidence = await this.loadEvidence(kind, id, locale);
        const title = evidence.profile?.metaTitle || evidence.title || null;
        const description =
            evidence.profile?.metaDescription ||
            evidence.shortDescription ||
            stripHtml(evidence.description).slice(0, 500) ||
            null;
        return {
            data: {
                kind: evidence.kind,
                id: evidence.id,
                locale: evidence.locale,
                title,
                description,
                canonical_url: evidence.profile?.canonicalUrl || evidence.publicUrl || null,
                robots_index: evidence.profile?.robotsIndex !== false,
                robots_follow: evidence.profile?.robotsFollow !== false,
                og_title: evidence.profile?.ogTitle || title,
                og_description: evidence.profile?.ogDescription || description,
                schema: buildEntitySchema(evidence, settings),
                organization: buildOrganizationSchema(settings),
            },
        };
    }

    async reports(locale: "fa" | "en" = "fa") {
        const trx = currentTrx();
        const settings = await this.settings();
        const [profiles, issues, events, posts, products, contentImpact] = await Promise.all([
            trx
                .from("seo_entity_profiles")
                .where("locale", locale)
                .select("entity_kind")
                .avg("score_total as average_score")
                .count("id as total")
                .groupBy("entity_kind")
                .orderBy("entity_kind", "asc"),
            trx
                .from("seo_issues")
                .whereIn("status", ["open", "regressed"])
                .select("severity", "rule_code")
                .count("id as count")
                .groupBy("severity", "rule_code")
                .orderByRaw("COUNT(id) DESC")
                .limit(20),
            trx.from("seo_events").orderBy("created_at", "desc").limit(50),
            trx
                .from("content_posts")
                .whereNull("deleted_at")
                .where("status", "published")
                .where("updated_at", "<", DateTime.utc().minus({ days: settings.content_stale_days }).toSQL())
                .count("id as count")
                .first(),
            trx.from("products").whereNull("deleted_at").where("status", "publish").count("id as count").first(),
            trx
                .from("content_posts")
                .whereNull("deleted_at")
                .select(
                    trx.raw("COALESCE(SUM(views_count), 0)::bigint AS views"),
                    trx.raw("COALESCE(SUM(product_clicks_count), 0)::bigint AS product_clicks"),
                    trx.raw("COALESCE(SUM(assisted_orders_count), 0)::bigint AS assisted_orders"),
                    trx.raw("COALESCE(SUM(assisted_revenue_minor), 0)::bigint AS assisted_revenue_minor"),
                )
                .first(),
        ]);
        return {
            data: {
                by_entity: profiles.map((row) => ({
                    entity_kind: row.entity_kind,
                    total: numeric(row.total),
                    average_score: numeric(row.average_score),
                })),
                top_issues: issues.map((row) => ({ ...row, count: numeric(row.count) })),
                stale_content_count: numeric(posts?.count),
                published_products_count: numeric(products?.count),
                content_impact: {
                    views: numeric(contentImpact?.views),
                    product_clicks: numeric(contentImpact?.product_clicks),
                    assisted_orders: numeric(contentImpact?.assisted_orders),
                    assisted_revenue_minor: numeric(contentImpact?.assisted_revenue_minor),
                },
                events: events.map((row) => ({ ...row, metadata: asJson(row.metadata, {}), created_at: iso(row.created_at) })),
            },
        };
    }

    private async listSimple(
        table: string,
        input: { page?: number; limit?: number; q?: string },
        searchable: string[],
        orderColumn: string,
    ) {
        const trx = currentTrx();
        const { page, limit, offset } = pagination(input.page, input.limit);
        const base = trx.from(table);
        if (input.q && searchable.length) {
            const escaped = input.q.replace(/[\\%_]/g, "\\$&");
            base.where((query) => {
                for (const [index, field] of searchable.entries()) {
                    if (index === 0) query.whereILike(field, `%${escaped}%`);
                    else query.orWhereILike(field, `%${escaped}%`);
                }
            });
        }
        const count = await base.clone().clearSelect().clearOrder().count("id as count").first();
        const rows = await base.clone().orderBy(orderColumn, "desc").offset(offset).limit(limit);
        return paginated(rows, numeric(count?.count), page, limit);
    }

    private serializeEntity(evidence: SeoEvidence, score: SeoScoreResult) {
        return {
            kind: evidence.kind,
            id: evidence.id,
            key: evidence.key,
            locale: evidence.locale,
            title: evidence.title,
            slug: evidence.slug,
            status: evidence.status,
            public_url: evidence.publicUrl,
            updated_at: evidence.updatedAt,
            score,
            profile: evidence.profile ?? {},
        };
    }

    private async collectEvidence(kind?: SeoEntityKind, locale: "fa" | "en" = "fa"): Promise<SeoEvidence[]> {
        if (!kind) {
            const kinds = SEO_ENTITY_KINDS.filter((item) => item !== "page");
            return (await Promise.all(kinds.map((item) => this.collectEvidence(item, locale)))).flat();
        }
        if (kind === "product") return this.productEvidence(locale);
        if (kind === "category") return this.taxonomyEvidence("category", locale);
        if (kind === "brand") return this.taxonomyEvidence("brand", locale);
        if (kind === "attribute") return this.attributeEvidence(locale);
        if (kind === "content_post") return this.contentEvidence(locale);
        if (kind === "media") return this.mediaEvidence(locale);
        return [];
    }

    private async loadEvidence(kind: SeoEntityKind, id: number, locale: "fa" | "en"): Promise<SeoEvidence> {
        const rows = await this.collectEvidence(kind, locale);
        const found = rows.find((item) => item.id === id);
        if (!found) throw new Exception("SEO entity not found", { status: 404, code: "E_SEO_ENTITY_NOT_FOUND" });
        return found;
    }

    private async profilesMap(kind: SeoEntityKind, locale: "fa" | "en") {
        const rows = await currentTrx().from("seo_entity_profiles").where("entity_kind", kind).where("locale", locale);
        return new Map(rows.map((row) => [String(row.entity_key), serializeProfile(row)]));
    }

    private async linksCounts(kind: SeoEntityKind) {
        const trx = currentTrx();
        const [inbound, outbound] = await Promise.all([
            trx
                .from("seo_internal_links")
                .where("target_kind", kind)
                .where("status", "applied")
                .select("target_key")
                .count("id as count")
                .groupBy("target_key"),
            trx
                .from("seo_internal_links")
                .where("source_kind", kind)
                .where("status", "applied")
                .select("source_key")
                .count("id as count")
                .groupBy("source_key"),
        ]);
        return {
            inbound: new Map(inbound.map((row) => [String(row.target_key), numeric(row.count)])),
            outbound: new Map(outbound.map((row) => [String(row.source_key), numeric(row.count)])),
        };
    }

    private async productEvidence(locale: "fa" | "en"): Promise<SeoEvidence[]> {
        const trx = currentTrx();
        const settings = await this.settings();
        const [rows, profiles, links] = await Promise.all([
            trx
                .from("products as p")
                .leftJoin("product_translations as pt", (join) => join.on("pt.product_id", "p.id").andOnVal("pt.locale", locale))
                .whereNull("p.deleted_at")
                .select(
                    "p.id",
                    "p.type",
                    "p.sku",
                    "p.global_unique_id",
                    "p.status",
                    "p.regular_price",
                    "p.sale_price",
                    "p.attributes",
                    "p.updated_at",
                    "pt.name",
                    "pt.slug",
                    "pt.description",
                    "pt.short_description",
                )
                .select(
                    trx.raw("(SELECT COUNT(*)::int FROM product_brand_links pbl WHERE pbl.product_id = p.id) AS brand_count"),
                    trx.raw(
                        "(SELECT COUNT(*)::int FROM product_category_links pcl WHERE pcl.product_id = p.id) AS category_count",
                    ),
                    trx.raw(
                        "(SELECT COUNT(*)::int FROM product_attribute_links pal WHERE pal.product_id = p.id) AS attribute_count",
                    ),
                    trx.raw("(SELECT COUNT(*)::int FROM product_images pi WHERE pi.product_id = p.id) AS image_count"),
                    trx.raw(
                        "(SELECT COUNT(*)::int FROM product_images pi JOIN media m ON m.id = pi.media_id WHERE pi.product_id = p.id AND NULLIF(BTRIM(COALESCE(m.alt, '')), '') IS NOT NULL) AS image_alt_count",
                    ),
                    trx.raw(
                        "(SELECT COUNT(*)::int FROM product_variations pv WHERE pv.product_id = p.id AND pv.deleted_at IS NULL) AS variation_count",
                    ),
                    trx.raw(
                        "(SELECT CASE WHEN COUNT(*) FILTER (WHERE inv.stock_status = 'instock') > 0 THEN 'instock' WHEN COUNT(*) FILTER (WHERE inv.stock_status = 'onbackorder') > 0 THEN 'onbackorder' WHEN COUNT(*) > 0 THEN 'outofstock' ELSE NULL END FROM inventory_items inv WHERE inv.product_id = p.id) AS stock_status",
                    ),
                    trx.raw(
                        "(SELECT pbt.name FROM product_brand_links pbl JOIN product_brand_translations pbt ON pbt.brand_id = pbl.brand_id AND pbt.locale = ? WHERE pbl.product_id = p.id ORDER BY pbl.brand_id ASC LIMIT 1) AS brand_name",
                        [locale],
                    ),
                    trx.raw(
                        "COALESCE((SELECT jsonb_agg(pct.name ORDER BY pcl.category_id) FROM product_category_links pcl JOIN product_category_translations pct ON pct.category_id = pcl.category_id AND pct.locale = ? WHERE pcl.product_id = p.id), '[]'::jsonb) AS category_names",
                        [locale],
                    ),
                    trx.raw(
                        "COALESCE((SELECT jsonb_agg(m.url ORDER BY pi.position, pi.id) FROM product_images pi JOIN media m ON m.id = pi.media_id WHERE pi.product_id = p.id AND m.url IS NOT NULL), '[]'::jsonb) AS image_urls",
                    ),
                ),
            this.profilesMap("product", locale),
            this.linksCounts("product"),
        ]);
        return rows.map((row) => {
            const key = entityKey("product", numeric(row.id));
            const path = publicPath("product", row.slug ? String(row.slug) : null, locale);
            return {
                kind: "product",
                key,
                id: numeric(row.id),
                locale,
                publicUrl: absoluteUrl(settings.base_url, path),
                title: row.name ? String(row.name) : null,
                slug: row.slug ? String(row.slug) : null,
                description: row.description ? String(row.description) : null,
                shortDescription: row.short_description ? String(row.short_description) : null,
                status: row.status ? String(row.status) : null,
                updatedAt: iso(row.updated_at),
                sku: row.sku ? String(row.sku) : null,
                gtin: row.global_unique_id ? String(row.global_unique_id) : null,
                brandCount: numeric(row.brand_count),
                brandName: row.brand_name ? String(row.brand_name) : null,
                categoryCount: numeric(row.category_count),
                categoryNames: asJson<string[]>(row.category_names, []).map(String),
                attributeCount: numeric(row.attribute_count),
                imageCount: numeric(row.image_count),
                imageUrls: asJson<string[]>(row.image_urls, []).map(String),
                featuredImageUrl: asJson<string[]>(row.image_urls, [])[0]
                    ? String(asJson<string[]>(row.image_urls, [])[0])
                    : null,
                imageAltCount: numeric(row.image_alt_count),
                priceMinor: nullableNumeric(row.sale_price) ?? nullableNumeric(row.regular_price),
                stockStatus: row.stock_status ? String(row.stock_status) : null,
                variationCount: numeric(row.variation_count),
                internalInboundCount: links.inbound.get(key) ?? 0,
                internalOutboundCount: links.outbound.get(key) ?? 0,
                profile: profiles.get(key) ?? null,
            };
        });
    }

    private async taxonomyEvidence(kind: "category" | "brand", locale: "fa" | "en"): Promise<SeoEvidence[]> {
        const trx = currentTrx();
        const settings = await this.settings();
        const table = kind === "category" ? "product_categories" : "product_brands";
        const translations = kind === "category" ? "product_category_translations" : "product_brand_translations";
        const idColumn = kind === "category" ? "category_id" : "brand_id";
        const linksTable = kind === "category" ? "product_category_links" : "product_brand_links";
        const [rows, profiles, links] = await Promise.all([
            trx
                .from(`${table} as e`)
                .leftJoin(`${translations} as et`, (join) => join.on(`et.${idColumn}`, "e.id").andOnVal("et.locale", locale))
                .select("e.id", "e.updated_at", "et.name", "et.slug", "et.description")
                .select(trx.raw(`(SELECT COUNT(*)::int FROM ${linksTable} l WHERE l.${idColumn} = e.id) AS product_count`)),
            this.profilesMap(kind, locale),
            this.linksCounts(kind),
        ]);
        return rows.map((row) => {
            const id = numeric(row.id);
            const key = entityKey(kind, id);
            return {
                kind,
                key,
                id,
                locale,
                publicUrl: absoluteUrl(settings.base_url, publicPath(kind, row.slug ? String(row.slug) : null, locale)),
                title: row.name ? String(row.name) : null,
                slug: row.slug ? String(row.slug) : null,
                description: row.description ? String(row.description) : null,
                status: "publish",
                updatedAt: iso(row.updated_at),
                productCount: numeric(row.product_count),
                internalInboundCount: links.inbound.get(key) ?? 0,
                internalOutboundCount: links.outbound.get(key) ?? 0,
                profile: profiles.get(key) ?? null,
            };
        });
    }

    private async attributeEvidence(locale: "fa" | "en"): Promise<SeoEvidence[]> {
        const trx = currentTrx();
        const [rows, profiles, links] = await Promise.all([
            trx
                .from("product_attributes as a")
                .leftJoin("product_attribute_translations as at", (join) =>
                    join.on("at.attribute_id", "a.id").andOnVal("at.locale", locale),
                )
                .select("a.id", "a.code", "a.has_archives", "a.updated_at", "at.name")
                .select(
                    trx.raw("(SELECT COUNT(*)::int FROM product_attribute_terms t WHERE t.attribute_id = a.id) AS term_count"),
                ),
            this.profilesMap("attribute", locale),
            this.linksCounts("attribute"),
        ]);
        return rows.map((row) => {
            const id = numeric(row.id);
            const key = entityKey("attribute", id);
            return {
                kind: "attribute",
                key,
                id,
                locale,
                title: row.name ? String(row.name) : String(row.code ?? ""),
                slug: String(row.code ?? ""),
                status: asBoolean(row.has_archives) ? "publish" : "private",
                updatedAt: iso(row.updated_at),
                termCount: numeric(row.term_count),
                internalInboundCount: links.inbound.get(key) ?? 0,
                internalOutboundCount: links.outbound.get(key) ?? 0,
                profile: profiles.get(key) ?? null,
            };
        });
    }

    private async contentEvidence(locale: "fa" | "en"): Promise<SeoEvidence[]> {
        const trx = currentTrx();
        const settings = await this.settings();
        const [rows, profiles, links] = await Promise.all([
            trx
                .from("content_posts as cp")
                .leftJoin("users as au", "au.id", "cp.author_user_id")
                .leftJoin("media as fm", "fm.id", "cp.featured_media_id")
                .whereNull("cp.deleted_at")
                .where("cp.locale", locale)
                .select(
                    "cp.id",
                    "cp.title",
                    "cp.slug",
                    "cp.excerpt",
                    "cp.content_html",
                    "cp.status",
                    "cp.author_user_id",
                    "au.email as author_name",
                    "fm.url as featured_media_url",
                    "cp.seo_title",
                    "cp.meta_description",
                    "cp.canonical_url",
                    "cp.robots_index",
                    "cp.robots_follow",
                    "cp.schema_type",
                    "cp.focus_keyword",
                    "cp.published_at",
                    "cp.updated_at",
                )
                .select(
                    trx.raw("(SELECT COUNT(*)::int FROM content_post_products cpp WHERE cpp.post_id = cp.id) AS product_count"),
                ),
            this.profilesMap("content_post", locale),
            this.linksCounts("content_post"),
        ]);
        return rows.map((row) => {
            const id = numeric(row.id);
            const key = entityKey("content_post", id);
            const profile = profiles.get(key) ?? {
                metaTitle: row.seo_title,
                metaDescription: row.meta_description,
                canonicalUrl: row.canonical_url,
                robotsIndex: asBoolean(row.robots_index, true),
                robotsFollow: asBoolean(row.robots_follow, true),
                schemaType: row.schema_type,
                focusKeyword: row.focus_keyword,
                engineProfile: settings.engine_profile,
            };
            return {
                kind: "content_post",
                key,
                id,
                locale,
                publicUrl: absoluteUrl(settings.base_url, publicPath("content_post", String(row.slug ?? ""), locale)),
                title: String(row.title ?? ""),
                slug: String(row.slug ?? ""),
                shortDescription: row.excerpt ? String(row.excerpt) : null,
                description: row.content_html ? String(row.content_html) : null,
                contentText: stripHtml(row.content_html),
                status: row.status ? String(row.status) : null,
                publishedAt: iso(row.published_at),
                updatedAt: iso(row.updated_at),
                authorId: nullableNumeric(row.author_user_id),
                authorName: row.author_name ? String(row.author_name) : null,
                featuredImageUrl: row.featured_media_url ? String(row.featured_media_url) : null,
                relatedProductCount: numeric(row.product_count),
                internalInboundCount: links.inbound.get(key) ?? 0,
                internalOutboundCount: links.outbound.get(key) ?? 0,
                profile,
            };
        });
    }

    private async mediaEvidence(locale: "fa" | "en"): Promise<SeoEvidence[]> {
        const trx = currentTrx();
        const [rows, profiles] = await Promise.all([
            trx
                .from("media")
                .where("kind", "image")
                .select("id", "url", "mime", "width", "height", "alt", "title", "caption", "description", "updated_at"),
            this.profilesMap("media", locale),
        ]);
        return rows.map((row) => {
            const id = numeric(row.id);
            const key = entityKey("media", id);
            return {
                kind: "media",
                key,
                id,
                locale,
                publicUrl: row.url ? String(row.url) : null,
                title: row.title ? String(row.title) : null,
                description: row.description ? String(row.description) : row.caption ? String(row.caption) : null,
                status: "publish",
                updatedAt: iso(row.updated_at),
                imageCount: 1,
                imageAltCount: String(row.alt ?? "").trim() ? 1 : 0,
                imageWidth: nullableNumeric(row.width),
                imageHeight: nullableNumeric(row.height),
                mime: row.mime ? String(row.mime) : null,
                profile: profiles.get(key) ?? null,
            };
        });
    }

    private async persistAuditResult(
        trx: TransactionClientContract,
        evidence: SeoEvidence,
        score: SeoScoreResult,
        auditRunId: number,
        actorId: number | null,
    ): Promise<number> {
        const now = DateTime.utc().toSQL();
        const existing = await trx
            .from("seo_entity_profiles")
            .where("entity_kind", evidence.kind)
            .where("entity_key", evidence.key)
            .where("locale", evidence.locale)
            .first();
        const profileValues = {
            tenant_id: currentTenantId(),
            entity_kind: evidence.kind,
            entity_id: evidence.id ?? null,
            entity_key: evidence.key,
            locale: evidence.locale,
            engine_profile: evidence.profile?.engineProfile ?? "k20",
            meta_title: evidence.profile?.metaTitle ?? null,
            meta_description: evidence.profile?.metaDescription ?? null,
            focus_keyword: evidence.profile?.focusKeyword ?? null,
            secondary_keywords: JSON.stringify(evidence.profile?.secondaryKeywords ?? []),
            canonical_url: evidence.profile?.canonicalUrl ?? null,
            robots_index: evidence.profile?.robotsIndex ?? true,
            robots_follow: evidence.profile?.robotsFollow ?? true,
            og_title: evidence.profile?.ogTitle ?? null,
            og_description: evidence.profile?.ogDescription ?? null,
            social_media_id: evidence.profile?.socialMediaId ?? null,
            schema_type: evidence.profile?.schemaType ?? null,
            schema_overrides: JSON.stringify(evidence.profile?.schemaOverrides ?? {}),
            score_total: score.total,
            score_technical: score.technical,
            score_content: score.content,
            score_schema: score.schema,
            score_media: score.media,
            score_commerce: score.commerce,
            version: existing ? numeric(existing.version) : 1,
            created_by_user_id: existing?.created_by_user_id ?? actorId,
            updated_by_user_id: actorId,
            created_at: existing?.created_at ?? now,
            updated_at: now,
        };
        const profileRows = await trx
            .table("seo_entity_profiles")
            .insert(profileValues)
            .onConflict(["tenant_id", "entity_kind", "entity_key", "locale"])
            .merge([
                "entity_id",
                "engine_profile",
                "meta_title",
                "meta_description",
                "focus_keyword",
                "secondary_keywords",
                "canonical_url",
                "robots_index",
                "robots_follow",
                "og_title",
                "og_description",
                "social_media_id",
                "schema_type",
                "schema_overrides",
                "score_total",
                "score_technical",
                "score_content",
                "score_schema",
                "score_media",
                "score_commerce",
                "updated_by_user_id",
                "updated_at",
            ])
            .returning("id");
        const profileId = numeric((profileRows[0] as DbRow | undefined)?.id ?? profileRows[0] ?? existing?.id);
        const activeCodes = new Set(score.issues.map((item) => item.ruleCode));
        const previous = await trx
            .from("seo_issues")
            .where("entity_kind", evidence.kind)
            .where("entity_key", evidence.key)
            .where("locale", evidence.locale);
        for (const item of score.issues) {
            const prior = previous.find((row) => row.rule_code === item.ruleCode);
            await trx
                .table("seo_issues")
                .insert({
                    tenant_id: currentTenantId(),
                    profile_id: profileId,
                    audit_run_id: auditRunId,
                    entity_kind: evidence.kind,
                    entity_id: evidence.id ?? null,
                    entity_key: evidence.key,
                    locale: evidence.locale,
                    rule_code: item.ruleCode,
                    severity: item.severity,
                    status: prior?.status === "resolved" ? "regressed" : prior?.status === "ignored" ? "ignored" : "open",
                    title: item.title,
                    description: item.description,
                    evidence: JSON.stringify(item.evidence),
                    suggested_fix: JSON.stringify(item.suggestedFix),
                    first_seen_at: prior?.first_seen_at ?? now,
                    last_seen_at: now,
                    resolved_at: null,
                    resolved_by_user_id: null,
                    created_at: prior?.created_at ?? now,
                    updated_at: now,
                })
                .onConflict(["tenant_id", "entity_kind", "entity_key", "locale", "rule_code"])
                .merge([
                    "profile_id",
                    "audit_run_id",
                    "entity_id",
                    "severity",
                    "status",
                    "title",
                    "description",
                    "evidence",
                    "suggested_fix",
                    "last_seen_at",
                    "resolved_at",
                    "resolved_by_user_id",
                    "updated_at",
                ]);
        }
        const stale = previous.filter((row) => !activeCodes.has(String(row.rule_code)) && row.status !== "ignored");
        for (const row of stale) {
            await trx.from("seo_issues").where("id", row.id).update({
                status: "resolved",
                resolved_at: now,
                resolved_by_user_id: actorId,
                updated_at: now,
            });
        }
        return profileId;
    }

    private async averageScore(): Promise<number> {
        const row = await currentTrx().from("seo_entity_profiles").avg("score_total as average").first();
        return numeric(row?.average);
    }

    private async event(
        eventType: string,
        kind: SeoEntityKind | null,
        key: string | null,
        actorId: number | null,
        metadata: Record<string, unknown>,
    ) {
        await currentTrx()
            .table("seo_events")
            .insert({
                tenant_id: currentTenantId(),
                actor_user_id: actorId,
                event_type: eventType,
                entity_kind: kind,
                entity_key: key,
                metadata: JSON.stringify(metadata),
                created_at: DateTime.utc().toSQL(),
            });
    }
}

export const seoService = new SeoService();
