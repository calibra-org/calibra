import { Exception } from "@adonisjs/core/exceptions";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import type { SettingValueType } from "#models/setting";
import {
    type ContentStatus,
    type ContentType,
    calculateContentMetrics,
    canTransitionContent,
    normalizePersian,
    sanitizeContentHtml,
    signalFingerprint,
    slugifyContent,
} from "#services/content/domain";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export interface ContentPostInput {
    type: ContentType;
    locale?: "fa" | "en";
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
    search_intent?: "informational" | "commercial" | "transactional" | "navigational" | "mixed" | null;
    focus_keyword?: string | null;
    structured_data?: Record<string, unknown>;
    scheduled_at?: string | null;
    category_ids?: number[];
    tag_ids?: number[];
    product_ids?: number[];
    change_summary?: string | null;
}

type DbRow = Record<string, unknown>;

export interface SerializedContentPost extends Record<string, unknown> {
    id: number;
    type: ContentType;
    status: ContentStatus;
    locale: "fa" | "en";
    title: string;
    slug: string;
    version: number;
}

export interface ContentPostResponse {
    data: SerializedContentPost;
}

export interface ContentSettings {
    default_locale: "fa" | "en";
    default_author_user_id: number | null;
    require_review_before_publish: boolean;
    allow_agent_web_search: boolean;
    allow_agent_publish: false;
    auto_publish_due: boolean;
    source_fetch_enabled: boolean;
    brand_voice: string;
    allowed_topics: string[];
    blocked_topics: string[];
    content_model: string;
    minimum_source_trust: number;
    minimum_publish_quality: number;
}

const DEFAULT_SETTINGS: ContentSettings = {
    default_locale: "fa",
    default_author_user_id: null,
    require_review_before_publish: true,
    allow_agent_web_search: true,
    allow_agent_publish: false,
    auto_publish_due: true,
    source_fetch_enabled: true,
    brand_voice: "دقیق، انسانی، مستند، غیراغراق‌آمیز و تصمیم‌ساز بنویس.",
    allowed_topics: [] as string[],
    blocked_topics: [] as string[],
    content_model: "gpt-5-mini",
    minimum_source_trust: 60,
    minimum_publish_quality: 70,
};

function numeric(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function affectedRows(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return 0;
        if (
            value.length === 1 &&
            (typeof value[0] === "number" || typeof value[0] === "bigint" || typeof value[0] === "string")
        ) {
            return numeric(value[0]);
        }
        return value.length;
    }
    return numeric(value);
}

function nullableNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, "\\$&");
}

function iso(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = DateTime.fromISO(String(value), { zone: "utc" });
    return parsed.isValid ? parsed.toISO() : String(value);
}

function parseDate(value: string | null | undefined, field: string): string | null {
    if (!value) return null;
    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) throw new Exception(`${field} is invalid`, { status: 422, code: "E_VALIDATION_ERROR" });
    return parsed.toUTC().toISO();
}

function uniqueIds(values: readonly number[] | undefined): number[] {
    return [...new Set((values ?? []).filter((value) => Number.isSafeInteger(value) && value > 0))];
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

function serializePostBase(row: DbRow): SerializedContentPost {
    return {
        id: numeric(row.id),
        type: String(row.type) as ContentType,
        status: String(row.status) as ContentStatus,
        locale: String(row.locale ?? "fa") === "en" ? "en" : "fa",
        title: String(row.title ?? ""),
        slug: String(row.slug ?? ""),
        excerpt: row.excerpt ?? null,
        content_html: row.content_html ?? "",
        featured_media_id: nullableNumeric(row.featured_media_id),
        author_user_id: nullableNumeric(row.author_user_id),
        reviewer_user_id: nullableNumeric(row.reviewer_user_id),
        source_signal_id: nullableNumeric(row.source_signal_id),
        seo_title: row.seo_title ?? null,
        meta_description: row.meta_description ?? null,
        canonical_url: row.canonical_url ?? null,
        robots_index: row.robots_index !== false,
        robots_follow: row.robots_follow !== false,
        schema_type: row.schema_type,
        search_intent: row.search_intent ?? null,
        focus_keyword: row.focus_keyword ?? null,
        structured_data: asJson<Record<string, unknown>>(row.structured_data, {}),
        scheduled_at: iso(row.scheduled_at),
        approved_at: iso(row.approved_at),
        published_at: iso(row.published_at),
        archived_at: iso(row.archived_at),
        version: numeric(row.version),
        word_count: numeric(row.word_count),
        reading_time_minutes: numeric(row.reading_time_minutes),
        seo_score: numeric(row.seo_score),
        quality_score: numeric(row.quality_score),
        commerce_score: numeric(row.commerce_score),
        views_count: numeric(row.views_count),
        product_clicks_count: numeric(row.product_clicks_count),
        assisted_orders_count: numeric(row.assisted_orders_count),
        assisted_revenue_minor: numeric(row.assisted_revenue_minor),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
    };
}

async function validateReferences(trx: TransactionClientContract, input: ContentPostInput): Promise<void> {
    const checks: Array<[string, number | null | undefined, string, string]> = [
        ["media", input.featured_media_id, "Media", "featured_media_id"],
        ["users", input.author_user_id, "Author", "author_user_id"],
        ["users", input.reviewer_user_id, "Reviewer", "reviewer_user_id"],
        ["content_signals", input.source_signal_id, "Signal", "source_signal_id"],
    ];
    for (const [table, id, label, field] of checks) {
        if (!id) continue;
        const row = await trx.from(table).where("id", id).first();
        if (!row) throw new Exception(`${label} not found`, { status: 422, code: `E_CONTENT_${field.toUpperCase()}_INVALID` });
    }

    const categoryIds = uniqueIds(input.category_ids);
    if (categoryIds.length > 0) {
        const rows = await trx.from("content_categories").whereIn("id", categoryIds).where("is_active", true).select("id");
        const found = new Set((rows as DbRow[]).map((row) => numeric(row.id)));
        const missing = categoryIds.find((id) => !found.has(id));
        if (missing !== undefined)
            throw new Exception(`category ${missing} not found or inactive`, {
                status: 422,
                code: "E_CONTENT_REFERENCE_INVALID",
            });
    }

    const tagIds = uniqueIds(input.tag_ids);
    if (tagIds.length > 0) {
        const rows = await trx.from("content_tags").whereIn("id", tagIds).select("id");
        const found = new Set((rows as DbRow[]).map((row) => numeric(row.id)));
        const missing = tagIds.find((id) => !found.has(id));
        if (missing !== undefined)
            throw new Exception(`tag ${missing} not found`, { status: 422, code: "E_CONTENT_REFERENCE_INVALID" });
    }

    const productIds = uniqueIds(input.product_ids);
    if (productIds.length > 0) {
        const rows = await trx.from("products").whereIn("id", productIds).whereNull("deleted_at").select("id");
        const found = new Set((rows as DbRow[]).map((row) => numeric(row.id)));
        const missing = productIds.find((id) => !found.has(id));
        if (missing !== undefined)
            throw new Exception(`product ${missing} not found`, { status: 422, code: "E_CONTENT_REFERENCE_INVALID" });
    }
}

async function lockContentNamespace(trx: TransactionClientContract): Promise<void> {
    const tenant = await trx.from("tenants").where("id", String(currentTenantId())).forUpdate().select("id").first();
    if (!tenant) throw new Exception("Tenant not found", { status: 409, code: "E_CONTENT_TENANT_CONTEXT" });
}

async function uniqueSlug(trx: TransactionClientContract, desired: string, locale: string, excludeId?: number): Promise<string> {
    const base = slugifyContent(desired);
    for (let index = 0; index < 1000; index += 1) {
        const candidate = index === 0 ? base : `${base}-${index + 1}`.slice(0, 191);
        const query = trx.from("content_posts").where("locale", locale).where("slug", candidate).whereNull("deleted_at");
        if (excludeId) query.whereNot("id", excludeId);
        if (!(await query.first())) return candidate;
    }
    throw new Exception("Unable to allocate a unique content slug", { status: 409, code: "E_CONTENT_SLUG_CONFLICT" });
}

async function replaceRelations(trx: TransactionClientContract, postId: number, input: ContentPostInput): Promise<void> {
    const tenantId = String(currentTenantId());
    const categories = uniqueIds(input.category_ids);
    const tags = uniqueIds(input.tag_ids);
    const products = uniqueIds(input.product_ids);
    await Promise.all([
        trx.from("content_post_categories").where("post_id", postId).delete(),
        trx.from("content_post_tags").where("post_id", postId).delete(),
        trx.from("content_post_products").where("post_id", postId).delete(),
    ]);
    if (categories.length > 0) {
        await trx
            .table("content_post_categories")
            .insert(categories.map((categoryId) => ({ tenant_id: tenantId, post_id: postId, category_id: categoryId })));
    }
    if (tags.length > 0) {
        await trx
            .table("content_post_tags")
            .insert(tags.map((tagId) => ({ tenant_id: tenantId, post_id: postId, tag_id: tagId })));
    }
    if (products.length > 0) {
        await trx.table("content_post_products").insert(
            products.map((productId, position) => ({
                tenant_id: tenantId,
                post_id: postId,
                product_id: productId,
                relation_type: position === 0 ? "primary" : "related",
                position,
            })),
        );
    }
}

async function relationMap(
    trx: TransactionClientContract,
    ids: number[],
    options: { publishedProductsOnly?: boolean; locale?: "fa" | "en" } = {},
) {
    if (ids.length === 0) return new Map<number, { categories: DbRow[]; tags: DbRow[]; products: DbRow[] }>();
    const productQuery = trx
        .from("content_post_products as pp")
        .join("products as p", "p.id", "pp.product_id")
        .leftJoin("product_translations as tr", function joinTranslation() {
            this.on("tr.product_id", "=", "p.id").andOnVal("tr.locale", "=", options.locale ?? "fa");
        })
        .whereIn("pp.post_id", ids);
    if (options.publishedProductsOnly) {
        productQuery.whereNull("p.deleted_at").where("p.status", "publish");
    }
    const [categories, tags, products] = await Promise.all([
        trx
            .from("content_post_categories as pc")
            .join("content_categories as c", "c.id", "pc.category_id")
            .whereIn("pc.post_id", ids)
            .select("pc.post_id", "c.id", "c.name", "c.slug"),
        trx
            .from("content_post_tags as pt")
            .join("content_tags as t", "t.id", "pt.tag_id")
            .whereIn("pt.post_id", ids)
            .select("pt.post_id", "t.id", "t.name", "t.slug"),
        productQuery
            .select("pp.post_id", "p.id", "p.sku", "tr.slug as slug", "p.status", "pp.relation_type", "pp.position", "tr.name")
            .orderBy("pp.position", "asc"),
    ]);
    const map = new Map<number, { categories: DbRow[]; tags: DbRow[]; products: DbRow[] }>();
    for (const id of ids) map.set(id, { categories: [], tags: [], products: [] });
    for (const row of categories as DbRow[]) map.get(numeric(row.post_id))?.categories.push(row);
    for (const row of tags as DbRow[]) map.get(numeric(row.post_id))?.tags.push(row);
    for (const row of products as DbRow[]) map.get(numeric(row.post_id))?.products.push(row);
    return map;
}

async function saveRevision(
    trx: TransactionClientContract,
    row: DbRow,
    actorId: number | null,
    summary?: string | null,
): Promise<void> {
    const postId = numeric(row.id);
    const relations = await relationMap(trx, [postId]);
    const linked = relations.get(postId) ?? { categories: [], tags: [], products: [] };
    const snapshot = {
        ...serializePostBase(row),
        category_ids: linked.categories.map((item) => numeric(item.id)),
        tag_ids: linked.tags.map((item) => numeric(item.id)),
        product_ids: linked.products.map((item) => numeric(item.id)),
    };
    await trx.table("content_revisions").insert({
        tenant_id: String(currentTenantId()),
        post_id: postId,
        version: numeric(row.version),
        snapshot: JSON.stringify(snapshot),
        change_summary: summary ?? null,
        created_by_user_id: actorId,
    });
}

async function recordEvent(
    trx: TransactionClientContract,
    postId: number | null,
    actorId: number | null,
    eventType: string,
    metadata: unknown = {},
) {
    await trx.table("content_events").insert({
        tenant_id: String(currentTenantId()),
        post_id: postId,
        actor_user_id: actorId,
        event_type: eventType,
        metadata: JSON.stringify(metadata),
    });
}

async function assertCategoryParentIsValid(
    trx: TransactionClientContract,
    categoryId: number | null,
    parentId: number | null | undefined,
): Promise<void> {
    if (!parentId) return;
    if (categoryId && parentId === categoryId) {
        throw new Exception("Category cannot be its own parent", { status: 422, code: "E_CONTENT_PARENT_INVALID" });
    }
    const parent = await trx.from("content_categories").where("id", parentId).first();
    if (!parent) throw new Exception("Parent category not found", { status: 422, code: "E_CONTENT_PARENT_INVALID" });
    if (!categoryId) return;
    const descendants = await trx.rawQuery(
        `WITH RECURSIVE descendants AS (
            SELECT id FROM content_categories WHERE parent_id = ?
            UNION ALL
            SELECT c.id FROM content_categories c
            INNER JOIN descendants d ON c.parent_id = d.id
        ) SELECT id FROM descendants WHERE id = ? LIMIT 1`,
        [categoryId, parentId],
    );
    if (((descendants as { rows?: DbRow[] }).rows ?? []).length > 0) {
        throw new Exception("Category parent would create a cycle", { status: 422, code: "E_CONTENT_PARENT_CYCLE" });
    }
}

function validateContentSourcePayload(payload: Record<string, unknown>): void {
    const type = String(payload.source_type ?? "manual");
    const feed = typeof payload.feed_url === "string" ? payload.feed_url.trim() : "";
    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    if (["rss", "atom"].includes(type) && !feed) {
        throw new Exception("feed_url is required for RSS or Atom sources", { status: 422, code: "E_CONTENT_FEED_URL_REQUIRED" });
    }
    if ([feed, url].some((value) => value && !/^https?:\/\//i.test(value))) {
        throw new Exception("Source URLs must use HTTP or HTTPS", { status: 422, code: "E_CONTENT_SOURCE_URL_INVALID" });
    }
}

export class ContentService {
    private settingsService = new SettingsService();

    async settings(): Promise<ContentSettings> {
        const stored = await this.settingsService.all("content");
        return {
            default_locale: stored.default_locale === "en" ? "en" : "fa",
            default_author_user_id: nullableNumeric(stored.default_author_user_id),
            require_review_before_publish: stored.require_review_before_publish !== false,
            allow_agent_web_search: stored.allow_agent_web_search !== false,
            allow_agent_publish: false,
            auto_publish_due: stored.auto_publish_due !== false,
            source_fetch_enabled: stored.source_fetch_enabled !== false,
            brand_voice: typeof stored.brand_voice === "string" ? stored.brand_voice : DEFAULT_SETTINGS.brand_voice,
            allowed_topics: Array.isArray(stored.allowed_topics)
                ? stored.allowed_topics.map(String)
                : DEFAULT_SETTINGS.allowed_topics,
            blocked_topics: Array.isArray(stored.blocked_topics)
                ? stored.blocked_topics.map(String)
                : DEFAULT_SETTINGS.blocked_topics,
            content_model:
                typeof stored.content_model === "string" && stored.content_model.trim()
                    ? stored.content_model.trim()
                    : DEFAULT_SETTINGS.content_model,
            minimum_source_trust: Math.max(
                0,
                Math.min(100, numeric(stored.minimum_source_trust ?? DEFAULT_SETTINGS.minimum_source_trust)),
            ),
            minimum_publish_quality: Math.max(
                0,
                Math.min(100, numeric(stored.minimum_publish_quality ?? DEFAULT_SETTINGS.minimum_publish_quality)),
            ),
        };
    }

    async updateSettings(payload: Record<string, unknown>): Promise<{ data: ContentSettings }> {
        const types: Record<string, SettingValueType> = {
            default_locale: "string",
            default_author_user_id: "number",
            require_review_before_publish: "boolean",
            allow_agent_web_search: "boolean",
            auto_publish_due: "boolean",
            source_fetch_enabled: "boolean",
            brand_voice: "string",
            allowed_topics: "json",
            blocked_topics: "json",
            content_model: "string",
            minimum_source_trust: "number",
            minimum_publish_quality: "number",
        };
        if (payload.allow_agent_publish === true) {
            throw new Exception("Direct Agent publishing is disabled by policy", {
                status: 422,
                code: "E_CONTENT_AGENT_DIRECT_PUBLISH_DISABLED",
            });
        }
        if (payload.default_author_user_id !== null && payload.default_author_user_id !== undefined) {
            const author = await currentTrx().from("users").where("id", numeric(payload.default_author_user_id)).first();
            if (!author)
                throw new Exception("Default author not found", { status: 422, code: "E_CONTENT_DEFAULT_AUTHOR_INVALID" });
        }
        for (const [key, value] of Object.entries(payload)) {
            if (!(key in types)) continue;
            await this.settingsService.set("content", key, value, types[key] ?? "string");
        }
        return { data: await this.settings() };
    }

    async list(input: {
        page?: number;
        limit?: number;
        q?: string;
        type?: string;
        status?: string;
        category_id?: number;
        author_user_id?: number;
        product_id?: number;
        from?: string | null;
        to?: string | null;
        sort?: string;
    }) {
        const trx = currentTrx();
        const page = input.page ?? 1;
        const limit = input.limit ?? 25;
        const offset = (page - 1) * limit;
        const base = trx.from("content_posts as p").whereNull("p.deleted_at");
        if (input.q) {
            const needle = `%${escapeLike(normalizePersian(input.q).toLowerCase())}%`;
            base.where((query) => {
                query
                    .whereRaw("LOWER(p.title) LIKE ? ESCAPE E'\\\\'", [needle])
                    .orWhereRaw("LOWER(COALESCE(p.excerpt, '')) LIKE ? ESCAPE E'\\\\'", [needle])
                    .orWhereRaw("LOWER(p.slug) LIKE ? ESCAPE E'\\\\'", [needle])
                    .orWhereRaw("LOWER(COALESCE(p.focus_keyword, '')) LIKE ? ESCAPE E'\\\\'", [needle]);
            });
        }
        if (input.type) base.where("p.type", input.type);
        if (input.status) base.where("p.status", input.status);
        if (input.author_user_id) base.where("p.author_user_id", input.author_user_id);
        if (input.from) {
            const from = parseDate(input.from, "from");
            if (from) base.where("p.created_at", ">=", from);
        }
        if (input.to) {
            const to = parseDate(input.to, "to");
            if (to) base.where("p.created_at", "<=", to);
        }
        if (input.category_id)
            base.whereExists(
                trx
                    .from("content_post_categories as fpc")
                    .select(1)
                    .whereRaw("fpc.post_id = p.id")
                    .where("fpc.category_id", input.category_id),
            );
        if (input.product_id)
            base.whereExists(
                trx
                    .from("content_post_products as fpp")
                    .select(1)
                    .whereRaw("fpp.post_id = p.id")
                    .where("fpp.product_id", input.product_id),
            );

        const countQuery = base.clone().clearSelect().clearOrder().countDistinct({ total: "p.id" }).first();
        const rowsQuery = base
            .clone()
            .leftJoin("users as au", "au.id", "p.author_user_id")
            .leftJoin("media as fm", "fm.id", "p.featured_media_id")
            .select("p.*", "au.email as author_email", "fm.url as featured_media_url", "fm.alt as featured_media_alt");
        switch (input.sort) {
            case "created_desc":
                rowsQuery.orderBy("p.created_at", "desc");
                break;
            case "published_desc":
                rowsQuery.orderByRaw("p.published_at DESC NULLS LAST");
                break;
            case "title_asc":
                rowsQuery.orderBy("p.title", "asc");
                break;
            case "score_desc":
                rowsQuery.orderByRaw("GREATEST(p.seo_score, p.quality_score, p.commerce_score) DESC");
                break;
            default:
                rowsQuery.orderBy("p.updated_at", "desc");
        }
        const [countRow, rows] = await Promise.all([countQuery, rowsQuery.limit(limit).offset(offset)]);
        const typedRows = rows as DbRow[];
        const relations = await relationMap(
            trx,
            typedRows.map((row) => numeric(row.id)),
        );
        const data = typedRows.map((row) => {
            const id = numeric(row.id);
            return {
                ...serializePostBase(row),
                author: row.author_email ? { id: nullableNumeric(row.author_user_id), email: row.author_email } : null,
                featured_media: row.featured_media_url
                    ? {
                          id: nullableNumeric(row.featured_media_id),
                          url: row.featured_media_url,
                          alt: row.featured_media_alt ?? null,
                      }
                    : null,
                ...(relations.get(id) ?? { categories: [], tags: [], products: [] }),
            };
        });
        const total = numeric((countRow as DbRow | undefined)?.total);
        return { data, meta: { page, limit, total, last_page: Math.max(1, Math.ceil(total / limit)) } };
    }

    async detail(id: number): Promise<ContentPostResponse> {
        const trx = currentTrx();
        const row = (await trx
            .from("content_posts as p")
            .leftJoin("users as au", "au.id", "p.author_user_id")
            .leftJoin("users as ru", "ru.id", "p.reviewer_user_id")
            .leftJoin("media as fm", "fm.id", "p.featured_media_id")
            .where("p.id", id)
            .whereNull("p.deleted_at")
            .select(
                "p.*",
                "au.email as author_email",
                "ru.email as reviewer_email",
                "fm.url as featured_media_url",
                "fm.alt as featured_media_alt",
            )
            .first()) as DbRow | undefined;
        if (!row) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        const relations = await relationMap(trx, [id]);
        const [events, revisions, sourceSignal, attributedOrders] = await Promise.all([
            trx.from("content_events").where("post_id", id).orderBy("created_at", "desc").limit(100),
            trx
                .from("content_revisions")
                .where("post_id", id)
                .select("id", "version", "change_summary", "created_by_user_id", "created_at")
                .orderBy("version", "desc")
                .limit(100),
            row.source_signal_id
                ? trx.from("content_signals").where("id", numeric(row.source_signal_id)).first()
                : Promise.resolve(null),
            trx
                .from("content_attribution_events as ca")
                .join("orders as o", "o.id", "ca.order_id")
                .where("ca.post_id", id)
                .where("ca.event_type", "order_assisted")
                .select(
                    "o.id",
                    "o.order_number",
                    "o.status",
                    "o.grand_total",
                    "o.currency",
                    "o.created_at",
                    "ca.value_minor",
                    "ca.metadata",
                )
                .orderBy("ca.occurred_at", "desc"),
        ]);
        return {
            data: {
                ...serializePostBase(row),
                author: row.author_email ? { id: nullableNumeric(row.author_user_id), email: row.author_email } : null,
                reviewer: row.reviewer_email ? { id: nullableNumeric(row.reviewer_user_id), email: row.reviewer_email } : null,
                featured_media: row.featured_media_url
                    ? {
                          id: nullableNumeric(row.featured_media_id),
                          url: row.featured_media_url,
                          alt: row.featured_media_alt ?? null,
                      }
                    : null,
                ...(relations.get(id) ?? { categories: [], tags: [], products: [] }),
                source_signal: sourceSignal ?? null,
                events: (events as DbRow[]).map((event) => ({
                    ...event,
                    id: numeric(event.id),
                    actor_user_id: nullableNumeric(event.actor_user_id),
                    created_at: iso(event.created_at),
                    metadata: asJson(event.metadata, {}),
                })),
                revisions: (revisions as DbRow[]).map((revision) => ({
                    ...revision,
                    id: numeric(revision.id),
                    version: numeric(revision.version),
                    created_by_user_id: nullableNumeric(revision.created_by_user_id),
                    created_at: iso(revision.created_at),
                })),
                attributed_orders: (attributedOrders as DbRow[]).map((order) => ({
                    ...order,
                    id: numeric(order.id),
                    order_number: numeric(order.order_number),
                    grand_total: numeric(order.grand_total),
                    value_minor: numeric(order.value_minor),
                    metadata: asJson(order.metadata, {}),
                    created_at: iso(order.created_at),
                })),
            },
        };
    }

    async create(input: ContentPostInput & { status?: ContentStatus }, actorId: number | null) {
        const trx = currentTrx();
        const settings = await this.settings();
        await lockContentNamespace(trx);
        await validateReferences(trx, input);
        const locale = input.locale ?? settings.default_locale;
        const slug = await uniqueSlug(trx, input.slug ?? input.title, locale);
        const contentHtml = sanitizeContentHtml(input.content_html);
        const structuredData = JSON.stringify(input.structured_data ?? {});
        if (structuredData.length > 100_000)
            throw new Exception("structured_data is too large", { status: 422, code: "E_CONTENT_STRUCTURED_DATA_TOO_LARGE" });
        const categoryIds = uniqueIds(input.category_ids);
        const productIds = uniqueIds(input.product_ids);
        const metrics = calculateContentMetrics({
            title: input.title,
            excerpt: input.excerpt,
            contentHtml,
            seoTitle: input.seo_title,
            metaDescription: input.meta_description,
            focusKeyword: input.focus_keyword,
            featuredMediaId: input.featured_media_id,
            categoryIds,
            productIds,
            canonicalUrl: input.canonical_url,
        });
        const requestedStatus = input.status ?? "draft";
        const status = requestedStatus === "published" && settings.require_review_before_publish ? "in_review" : requestedStatus;
        const scheduledAt = parseDate(input.scheduled_at, "scheduled_at");
        if (status === "scheduled" && !scheduledAt)
            throw new Exception("scheduled_at is required", { status: 422, code: "E_CONTENT_SCHEDULE_REQUIRED" });
        if (scheduledAt && DateTime.fromISO(scheduledAt).toMillis() <= DateTime.utc().toMillis())
            throw new Exception("scheduled_at must be in the future", { status: 422, code: "E_CONTENT_SCHEDULE_PAST" });
        const now = DateTime.utc().toISO();
        const inserted = (await trx
            .table("content_posts")
            .insert({
                tenant_id: String(currentTenantId()),
                type: input.type,
                status,
                locale,
                title: input.title.trim(),
                slug,
                excerpt: input.excerpt ?? null,
                content_html: contentHtml,
                featured_media_id: input.featured_media_id ?? null,
                author_user_id: input.author_user_id ?? settings.default_author_user_id ?? actorId,
                reviewer_user_id: input.reviewer_user_id ?? null,
                source_signal_id: input.source_signal_id ?? null,
                seo_title: input.seo_title ?? null,
                meta_description: input.meta_description ?? null,
                canonical_url: input.canonical_url ?? null,
                robots_index: input.robots_index ?? true,
                robots_follow: input.robots_follow ?? true,
                schema_type: input.schema_type ?? (input.type === "news" ? "NewsArticle" : "BlogPosting"),
                search_intent: input.search_intent ?? null,
                focus_keyword: input.focus_keyword ?? null,
                structured_data: structuredData,
                scheduled_at: scheduledAt,
                approved_at: status === "approved" || status === "scheduled" || status === "published" ? now : null,
                published_at: status === "published" ? now : null,
                ...{
                    word_count: metrics.wordCount,
                    reading_time_minutes: metrics.readingTimeMinutes,
                    seo_score: metrics.seoScore,
                    quality_score: metrics.qualityScore,
                    commerce_score: metrics.commerceScore,
                },
            })
            .returning("*")) as DbRow[];
        const row = inserted[0];
        if (!row) throw new Exception("Content post could not be created", { status: 500, code: "E_CONTENT_CREATE" });
        const postId = numeric(row.id);
        await replaceRelations(trx, postId, input);
        if (input.source_signal_id)
            await trx
                .from("content_signals")
                .where("id", input.source_signal_id)
                .update({ status: "converted", updated_at: now });
        await recordEvent(trx, postId, actorId, "content.created", { status, type: input.type });
        return this.detail(postId);
    }

    async update(id: number, input: ContentPostInput & { expected_version: number }, actorId: number | null) {
        const trx = currentTrx();
        const row = (await trx.from("content_posts").where("id", id).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!row) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        if (numeric(row.version) !== input.expected_version)
            throw new Exception("Content has changed; reload before saving", { status: 409, code: "E_CONTENT_VERSION_CONFLICT" });
        if (row.status === "archived")
            throw new Exception("Archived content must be restored before editing", { status: 409, code: "E_CONTENT_IMMUTABLE" });
        await validateReferences(trx, input);
        await saveRevision(trx, row, actorId, input.change_summary);
        await lockContentNamespace(trx);
        const locale = input.locale ?? String(row.locale ?? "fa");
        const slug = await uniqueSlug(trx, input.slug ?? input.title, locale, id);
        const contentHtml = sanitizeContentHtml(input.content_html);
        const structuredData = JSON.stringify(input.structured_data ?? {});
        if (structuredData.length > 100_000)
            throw new Exception("structured_data is too large", { status: 422, code: "E_CONTENT_STRUCTURED_DATA_TOO_LARGE" });
        const metrics = calculateContentMetrics({
            title: input.title,
            excerpt: input.excerpt,
            contentHtml,
            seoTitle: input.seo_title,
            metaDescription: input.meta_description,
            focusKeyword: input.focus_keyword,
            featuredMediaId: input.featured_media_id,
            categoryIds: input.category_ids,
            productIds: input.product_ids,
            canonicalUrl: input.canonical_url,
        });
        const scheduledAt = parseDate(input.scheduled_at, "scheduled_at");
        if (row.status === "scheduled" && !scheduledAt)
            throw new Exception("scheduled_at is required", { status: 422, code: "E_CONTENT_SCHEDULE_REQUIRED" });
        if (row.status === "scheduled" && scheduledAt && DateTime.fromISO(scheduledAt).toMillis() <= DateTime.utc().toMillis()) {
            throw new Exception("scheduled_at must be in the future", { status: 422, code: "E_CONTENT_SCHEDULE_PAST" });
        }
        const updated = await trx
            .from("content_posts")
            .where("id", id)
            .where("version", input.expected_version)
            .update({
                type: input.type,
                locale,
                title: input.title.trim(),
                slug,
                excerpt: input.excerpt ?? null,
                content_html: contentHtml,
                featured_media_id: input.featured_media_id ?? null,
                author_user_id: input.author_user_id ?? null,
                reviewer_user_id: input.reviewer_user_id ?? null,
                source_signal_id: input.source_signal_id ?? null,
                seo_title: input.seo_title ?? null,
                meta_description: input.meta_description ?? null,
                canonical_url: input.canonical_url ?? null,
                robots_index: input.robots_index ?? true,
                robots_follow: input.robots_follow ?? true,
                schema_type: input.schema_type ?? (input.type === "news" ? "NewsArticle" : "BlogPosting"),
                search_intent: input.search_intent ?? null,
                focus_keyword: input.focus_keyword ?? null,
                structured_data: structuredData,
                scheduled_at: scheduledAt,
                word_count: metrics.wordCount,
                reading_time_minutes: metrics.readingTimeMinutes,
                seo_score: metrics.seoScore,
                quality_score: metrics.qualityScore,
                commerce_score: metrics.commerceScore,
                version: input.expected_version + 1,
                updated_at: DateTime.utc().toISO(),
            });
        if (affectedRows(updated) !== 1)
            throw new Exception("Content version conflict", { status: 409, code: "E_CONTENT_VERSION_CONFLICT" });
        await replaceRelations(trx, id, input);
        await recordEvent(trx, id, actorId, "content.updated", {
            from_version: input.expected_version,
            to_version: input.expected_version + 1,
        });
        return this.detail(id);
    }

    async transition(
        id: number,
        input: { to_status: ContentStatus; expected_version: number; scheduled_at?: string | null; reason?: string | null },
        actorId: number | null,
    ) {
        const trx = currentTrx();
        const row = (await trx.from("content_posts").where("id", id).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!row) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        const from = String(row.status) as ContentStatus;
        if (numeric(row.version) !== input.expected_version)
            throw new Exception("Content has changed; reload before continuing", {
                status: 409,
                code: "E_CONTENT_VERSION_CONFLICT",
            });
        if (!canTransitionContent(from, input.to_status))
            throw new Exception(`Cannot transition content from ${from} to ${input.to_status}`, {
                status: 409,
                code: "E_CONTENT_TRANSITION",
            });
        const settings = await this.settings();
        if (input.to_status === "approved" && !row.reviewer_user_id) {
            throw new Exception("A reviewer must be assigned before approval", {
                status: 409,
                code: "E_CONTENT_REVIEWER_REQUIRED",
            });
        }
        if (input.to_status === "published") {
            if (settings.require_review_before_publish && !["approved", "scheduled", "published"].includes(from)) {
                throw new Exception("Content must be approved before publishing", {
                    status: 409,
                    code: "E_CONTENT_REVIEW_REQUIRED",
                });
            }
            if (numeric(row.quality_score) < numeric(settings.minimum_publish_quality)) {
                throw new Exception("Content quality score is below the publishing threshold", {
                    status: 409,
                    code: "E_CONTENT_QUALITY_GATE",
                });
            }
        }
        let scheduledAt = parseDate(input.scheduled_at, "scheduled_at") ?? iso(row.scheduled_at);
        if (input.to_status === "scheduled") {
            if (!scheduledAt)
                throw new Exception("scheduled_at is required", { status: 422, code: "E_CONTENT_SCHEDULE_REQUIRED" });
            if (DateTime.fromISO(scheduledAt).toMillis() <= DateTime.utc().toMillis())
                throw new Exception("scheduled_at must be in the future", { status: 422, code: "E_CONTENT_SCHEDULE_PAST" });
        } else {
            scheduledAt = null;
        }
        await saveRevision(trx, row, actorId, input.reason);
        const now = DateTime.utc().toISO();
        const patch: Record<string, unknown> = {
            status: input.to_status,
            version: input.expected_version + 1,
            scheduled_at: scheduledAt,
            updated_at: now,
        };
        if (input.to_status === "approved") patch.approved_at = now;
        if (input.to_status === "published") {
            patch.published_at = row.published_at ?? now;
            patch.approved_at = row.approved_at ?? now;
            patch.scheduled_at = null;
        }
        if (input.to_status === "archived") patch.archived_at = now;
        if (input.to_status === "draft") patch.archived_at = null;
        const updated = await trx.from("content_posts").where("id", id).where("version", input.expected_version).update(patch);
        if (affectedRows(updated) !== 1)
            throw new Exception("Content version conflict", { status: 409, code: "E_CONTENT_VERSION_CONFLICT" });
        await recordEvent(trx, id, actorId, `content.${input.to_status}`, {
            from,
            reason: input.reason ?? null,
            scheduled_at: scheduledAt,
        });
        return this.detail(id);
    }

    async destroy(id: number, expectedVersion: number, actorId: number | null) {
        const trx = currentTrx();
        const row = (await trx.from("content_posts").where("id", id).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!row) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        if (numeric(row.version) !== expectedVersion)
            throw new Exception("Content version conflict", { status: 409, code: "E_CONTENT_VERSION_CONFLICT" });
        await saveRevision(trx, row, actorId, "حذف نرم");
        await trx
            .from("content_posts")
            .where("id", id)
            .update({ deleted_at: DateTime.utc().toISO(), updated_at: DateTime.utc().toISO(), version: expectedVersion + 1 });
        await recordEvent(trx, id, actorId, "content.deleted");
    }

    async addOrderAttribution(
        postId: number,
        input: { order_id: number; product_id?: number | null; note?: string | null },
        actorId: number | null,
    ) {
        const trx = currentTrx();
        const post = (await trx.from("content_posts").where("id", postId).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!post) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        const order = (await trx.from("orders").where("id", input.order_id).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!order) throw new Exception("Order not found", { status: 422, code: "E_CONTENT_ORDER_INVALID" });
        if (String(order.status) !== "completed")
            throw new Exception("Only completed orders can be attributed", {
                status: 409,
                code: "E_CONTENT_ORDER_NOT_COMPLETED",
            });
        if (input.product_id) {
            const linked = await trx
                .from("content_post_products")
                .where("post_id", postId)
                .where("product_id", input.product_id)
                .first();
            if (!linked)
                throw new Exception("Product is not linked to this content", {
                    status: 422,
                    code: "E_CONTENT_PRODUCT_NOT_LINKED",
                });
            const purchased = await trx
                .from("order_line_items")
                .where("order_id", input.order_id)
                .where("product_id", input.product_id)
                .first();
            if (!purchased)
                throw new Exception("Product is not present in the selected order", {
                    status: 422,
                    code: "E_CONTENT_PRODUCT_NOT_IN_ORDER",
                });
        }
        const existing = (await trx
            .from("content_attribution_events")
            .where("order_id", input.order_id)
            .where("event_type", "order_assisted")
            .first()) as DbRow | undefined;
        if (existing) {
            const message =
                numeric(existing.post_id) === postId
                    ? "Order is already attributed to this content"
                    : "Order is already attributed to another content item";
            throw new Exception(message, { status: 409, code: "E_CONTENT_ATTRIBUTION_EXISTS" });
        }
        const value = numeric(order.grand_total);
        await trx.table("content_attribution_events").insert({
            tenant_id: String(currentTenantId()),
            post_id: postId,
            product_id: input.product_id ?? null,
            order_id: input.order_id,
            event_type: "order_assisted",
            value_minor: value,
            metadata: JSON.stringify({ note: input.note ?? null, actor_user_id: actorId, attribution: "manual_admin" }),
        });
        await trx
            .from("content_posts")
            .where("id", postId)
            .update({
                assisted_orders_count: trx.raw("assisted_orders_count + 1"),
                assisted_revenue_minor: trx.raw("assisted_revenue_minor + ?", [value]),
                updated_at: DateTime.utc().toISO(),
            });
        await recordEvent(trx, postId, actorId, "content.order_attributed", {
            order_id: input.order_id,
            product_id: input.product_id ?? null,
            value_minor: value,
        });
        return this.detail(postId);
    }

    async removeOrderAttribution(postId: number, orderId: number, actorId: number | null) {
        const trx = currentTrx();
        const post = (await trx.from("content_posts").where("id", postId).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!post) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        const event = (await trx
            .from("content_attribution_events")
            .where("post_id", postId)
            .where("order_id", orderId)
            .where("event_type", "order_assisted")
            .forUpdate()
            .first()) as DbRow | undefined;
        if (!event) throw new Exception("Order attribution not found", { status: 404, code: "E_NOT_FOUND" });
        const value = numeric(event.value_minor);
        await trx.from("content_attribution_events").where("id", numeric(event.id)).delete();
        await trx
            .from("content_posts")
            .where("id", postId)
            .update({
                assisted_orders_count: trx.raw("GREATEST(assisted_orders_count - 1, 0)"),
                assisted_revenue_minor: trx.raw("GREATEST(assisted_revenue_minor - ?, 0)", [value]),
                updated_at: DateTime.utc().toISO(),
            });
        await recordEvent(trx, postId, actorId, "content.order_attribution_removed", { order_id: orderId, value_minor: value });
        return this.detail(postId);
    }

    async revisions(id: number) {
        const rows = await currentTrx().from("content_revisions").where("post_id", id).orderBy("version", "desc");
        return {
            data: (rows as DbRow[]).map((row) => ({
                ...row,
                id: numeric(row.id),
                post_id: numeric(row.post_id),
                version: numeric(row.version),
                created_by_user_id: nullableNumeric(row.created_by_user_id),
                created_at: iso(row.created_at),
                snapshot: asJson(row.snapshot, {}),
            })),
        };
    }

    async restoreRevision(
        postId: number,
        revisionId: number,
        expectedVersion: number,
        actorId: number | null,
        summary?: string | null,
    ) {
        const trx = currentTrx();
        const row = (await trx.from("content_posts").where("id", postId).whereNull("deleted_at").forUpdate().first()) as
            | DbRow
            | undefined;
        if (!row) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        if (numeric(row.version) !== expectedVersion)
            throw new Exception("Content version conflict", { status: 409, code: "E_CONTENT_VERSION_CONFLICT" });
        const revision = (await trx.from("content_revisions").where("id", revisionId).where("post_id", postId).first()) as
            | DbRow
            | undefined;
        if (!revision) throw new Exception("Revision not found", { status: 404, code: "E_NOT_FOUND" });
        const snapshot = asJson<Record<string, unknown>>(revision.snapshot, {});
        const restoredInput: ContentPostInput & { expected_version: number } = {
            type: String(snapshot.type) as ContentType,
            locale: String(snapshot.locale ?? "fa") as "fa" | "en",
            title: String(snapshot.title ?? ""),
            slug: String(snapshot.slug ?? ""),
            excerpt: snapshot.excerpt ? String(snapshot.excerpt) : null,
            content_html: String(snapshot.content_html ?? ""),
            featured_media_id: nullableNumeric(snapshot.featured_media_id),
            author_user_id: nullableNumeric(snapshot.author_user_id),
            reviewer_user_id: nullableNumeric(snapshot.reviewer_user_id),
            source_signal_id: nullableNumeric(snapshot.source_signal_id),
            seo_title: snapshot.seo_title ? String(snapshot.seo_title) : null,
            meta_description: snapshot.meta_description ? String(snapshot.meta_description) : null,
            canonical_url: snapshot.canonical_url ? String(snapshot.canonical_url) : null,
            robots_index: snapshot.robots_index !== false,
            robots_follow: snapshot.robots_follow !== false,
            schema_type: String(snapshot.schema_type ?? "BlogPosting") as "Article" | "BlogPosting" | "NewsArticle",
            search_intent: (snapshot.search_intent ? String(snapshot.search_intent) : null) as ContentPostInput["search_intent"],
            focus_keyword: snapshot.focus_keyword ? String(snapshot.focus_keyword) : null,
            structured_data: asJson(snapshot.structured_data, {}),
            scheduled_at: snapshot.scheduled_at ? String(snapshot.scheduled_at) : null,
            category_ids: asJson<number[]>(snapshot.category_ids, []),
            tag_ids: asJson<number[]>(snapshot.tag_ids, []),
            product_ids: asJson<number[]>(snapshot.product_ids, []),
            change_summary: summary ?? `بازگردانی نسخه ${numeric(revision.version)}`,
            expected_version: expectedVersion,
        };
        const result = await this.update(postId, restoredInput, actorId);
        await recordEvent(trx, postId, actorId, "content.revision_restored", {
            revision_id: revisionId,
            revision_version: numeric(revision.version),
        });
        return result;
    }

    async summary() {
        const trx = currentTrx();
        const [counts, averages, due, signals, agents, topPosts] = await Promise.all([
            trx.from("content_posts").whereNull("deleted_at").select("status").count("id as count").groupBy("status"),
            trx
                .from("content_posts")
                .whereNull("deleted_at")
                .avg({ seo_score: "seo_score", quality_score: "quality_score", commerce_score: "commerce_score" })
                .sum({
                    views: "views_count",
                    product_clicks: "product_clicks_count",
                    assisted_revenue_minor: "assisted_revenue_minor",
                })
                .first(),
            trx
                .from("content_posts")
                .where("status", "scheduled")
                .where("scheduled_at", "<=", DateTime.utc().plus({ days: 7 }).toISO())
                .count("id as count")
                .first(),
            trx.from("content_signals").where("status", "new").where("opportunity_score", ">=", 70).count("id as count").first(),
            trx.from("content_agent_runs").whereIn("status", ["queued", "running"]).count("id as count").first(),
            trx
                .from("content_posts")
                .where("status", "published")
                .whereNull("deleted_at")
                .select(
                    "id",
                    "title",
                    "views_count",
                    "product_clicks_count",
                    "assisted_revenue_minor",
                    "seo_score",
                    "quality_score",
                )
                .orderBy("views_count", "desc")
                .limit(5),
        ]);
        const byStatus: Record<string, number> = {};
        for (const row of counts as DbRow[]) byStatus[String(row.status)] = numeric(row.count);
        const avg = (averages ?? {}) as DbRow;
        return {
            data: {
                totals: { ...byStatus, total: Object.values(byStatus).reduce((sum, value) => sum + value, 0) },
                scores: {
                    seo: Math.round(numeric(avg.seo_score)),
                    quality: Math.round(numeric(avg.quality_score)),
                    commerce: Math.round(numeric(avg.commerce_score)),
                },
                performance: {
                    views: numeric(avg.views),
                    product_clicks: numeric(avg.product_clicks),
                    assisted_revenue_minor: numeric(avg.assisted_revenue_minor),
                },
                action_counts: {
                    scheduled_next_7_days: numeric((due as DbRow | undefined)?.count),
                    high_opportunity_signals: numeric((signals as DbRow | undefined)?.count),
                    active_agent_runs: numeric((agents as DbRow | undefined)?.count),
                },
                top_posts: (topPosts as DbRow[]).map((row) => ({
                    ...row,
                    id: numeric(row.id),
                    views_count: numeric(row.views_count),
                    product_clicks_count: numeric(row.product_clicks_count),
                    assisted_revenue_minor: numeric(row.assisted_revenue_minor),
                    seo_score: numeric(row.seo_score),
                    quality_score: numeric(row.quality_score),
                })),
            },
        };
    }

    async calendar(from?: string | null, to?: string | null) {
        const start = parseDate(from, "from") ?? DateTime.utc().startOf("month").toISO();
        const end = parseDate(to, "to") ?? DateTime.utc().endOf("month").toISO();
        if (DateTime.fromISO(start).toMillis() > DateTime.fromISO(end).toMillis()) {
            throw new Exception("from must be before to", { status: 422, code: "E_CONTENT_DATE_RANGE_INVALID" });
        }
        const rows = await currentTrx()
            .from("content_posts")
            .whereNull("deleted_at")
            .where((query) => query.whereBetween("scheduled_at", [start, end]).orWhereBetween("published_at", [start, end]))
            .select(
                "id",
                "title",
                "type",
                "status",
                "scheduled_at",
                "published_at",
                "author_user_id",
                "seo_score",
                "quality_score",
            )
            .orderByRaw("COALESCE(scheduled_at, published_at) ASC");
        return {
            data: (rows as DbRow[]).map((row) => ({
                ...row,
                id: numeric(row.id),
                author_user_id: nullableNumeric(row.author_user_id),
                scheduled_at: iso(row.scheduled_at),
                published_at: iso(row.published_at),
                seo_score: numeric(row.seo_score),
                quality_score: numeric(row.quality_score),
            })),
        };
    }

    async reports() {
        const trx = currentTrx();
        const [monthly, status, products, sources, agents] = await Promise.all([
            trx.rawQuery(`SELECT date_trunc('month', published_at) AS month,
                COUNT(*)::bigint AS posts,
                SUM(views_count)::bigint AS views,
                SUM(product_clicks_count)::bigint AS product_clicks,
                SUM(assisted_orders_count)::bigint AS assisted_orders,
                SUM(assisted_revenue_minor)::bigint AS assisted_revenue_minor
                FROM content_posts
                WHERE deleted_at IS NULL AND status = 'published' AND published_at IS NOT NULL
                GROUP BY 1 ORDER BY 1 DESC LIMIT 18`),
            trx.from("content_posts").whereNull("deleted_at").select("status").count("id as count").groupBy("status"),
            trx.rawQuery(`SELECT pr.id, pr.sku, tr.name,
                COUNT(DISTINCT pp.post_id)::bigint AS posts,
                COUNT(*) FILTER (WHERE ae.event_type = 'product_click')::bigint AS product_clicks,
                COALESCE(SUM(ae.value_minor) FILTER (WHERE ae.event_type = 'order_assisted'), 0)::bigint AS assisted_revenue_minor
                FROM content_post_products pp
                INNER JOIN content_posts p ON p.id = pp.post_id AND p.deleted_at IS NULL
                INNER JOIN products pr ON pr.id = pp.product_id AND pr.deleted_at IS NULL
                LEFT JOIN product_translations tr ON tr.product_id = pr.id AND tr.locale = 'fa'
                LEFT JOIN content_attribution_events ae ON ae.post_id = pp.post_id AND ae.product_id = pp.product_id
                GROUP BY pr.id, pr.sku, tr.name
                ORDER BY assisted_revenue_minor DESC, product_clicks DESC
                LIMIT 20`),
            trx
                .from("content_sources as s")
                .leftJoin("content_signals as g", "g.source_id", "s.id")
                .select("s.id", "s.name", "s.trust_score", "s.status")
                .count("g.id as signals")
                .avg("g.opportunity_score as avg_opportunity")
                .groupBy("s.id")
                .orderBy("signals", "desc"),
            trx
                .from("content_agent_runs")
                .select("agent_kind", "status")
                .count("id as count")
                .groupBy("agent_kind", "status")
                .orderBy("agent_kind"),
        ]);
        return {
            data: {
                monthly: ((monthly as { rows?: DbRow[] }).rows ?? []).map((row) => ({
                    ...row,
                    month: iso(row.month),
                    posts: numeric(row.posts),
                    views: numeric(row.views),
                    product_clicks: numeric(row.product_clicks),
                    assisted_orders: numeric(row.assisted_orders),
                    assisted_revenue_minor: numeric(row.assisted_revenue_minor),
                })),
                status: (status as DbRow[]).map((row) => ({ status: row.status, count: numeric(row.count) })),
                products: (((products as { rows?: DbRow[] }).rows ?? products) as DbRow[]).map((row) => ({
                    ...row,
                    id: numeric(row.id),
                    posts: numeric(row.posts),
                    product_clicks: numeric(row.product_clicks),
                    assisted_revenue_minor: numeric(row.assisted_revenue_minor),
                })),
                sources: (sources as DbRow[]).map((row) => ({
                    ...row,
                    id: numeric(row.id),
                    trust_score: numeric(row.trust_score),
                    signals: numeric(row.signals),
                    avg_opportunity: Math.round(numeric(row.avg_opportunity)),
                })),
                agents: (agents as DbRow[]).map((row) => ({
                    agent_kind: row.agent_kind,
                    status: row.status,
                    count: numeric(row.count),
                })),
            },
        };
    }

    async taxonomy() {
        const trx = currentTrx();
        const [categories, tags] = await Promise.all([
            trx
                .from("content_categories as c")
                .leftJoin("content_post_categories as pc", "pc.category_id", "c.id")
                .select("c.*")
                .countDistinct("pc.post_id as posts_count")
                .groupBy("c.id")
                .orderBy("c.position", "asc")
                .orderBy("c.name", "asc"),
            trx
                .from("content_tags as t")
                .leftJoin("content_post_tags as pt", "pt.tag_id", "t.id")
                .select("t.*")
                .countDistinct("pt.post_id as posts_count")
                .groupBy("t.id")
                .orderBy("t.name", "asc"),
        ]);
        return {
            data: {
                categories: (categories as DbRow[]).map((row) => ({
                    ...row,
                    id: numeric(row.id),
                    parent_id: nullableNumeric(row.parent_id),
                    position: numeric(row.position),
                    posts_count: numeric(row.posts_count),
                    created_at: iso(row.created_at),
                    updated_at: iso(row.updated_at),
                })),
                tags: (tags as DbRow[]).map((row) => ({
                    ...row,
                    id: numeric(row.id),
                    posts_count: numeric(row.posts_count),
                    created_at: iso(row.created_at),
                    updated_at: iso(row.updated_at),
                })),
            },
        };
    }

    async createTaxonomy(payload: {
        kind: "category" | "tag";
        name: string;
        slug?: string;
        description?: string | null;
        parent_id?: number | null;
        position?: number;
        is_active?: boolean;
    }) {
        const trx = currentTrx();
        await lockContentNamespace(trx);
        const table = payload.kind === "category" ? "content_categories" : "content_tags";
        const slug = slugifyContent(payload.slug ?? payload.name);
        const existing = await trx.from(table).where("slug", slug).first();
        if (existing) throw new Exception("Slug already exists", { status: 409, code: "E_CONTENT_SLUG_CONFLICT" });
        if (payload.kind === "category") await assertCategoryParentIsValid(trx, null, payload.parent_id);
        const values: Record<string, unknown> = {
            tenant_id: String(currentTenantId()),
            name: payload.name.trim(),
            slug,
            description: payload.description ?? null,
        };
        if (payload.kind === "category")
            Object.assign(values, {
                parent_id: payload.parent_id ?? null,
                position: payload.position ?? 0,
                is_active: payload.is_active ?? true,
            });
        const rows = (await trx.table(table).insert(values).returning("*")) as DbRow[];
        return { data: rows[0] };
    }

    async updateTaxonomy(
        id: number,
        payload: {
            kind: "category" | "tag";
            name: string;
            slug?: string;
            description?: string | null;
            parent_id?: number | null;
            position?: number;
            is_active?: boolean;
        },
    ) {
        const trx = currentTrx();
        await lockContentNamespace(trx);
        const table = payload.kind === "category" ? "content_categories" : "content_tags";
        const row = await trx.from(table).where("id", id).first();
        if (!row) throw new Exception("Taxonomy item not found", { status: 404, code: "E_NOT_FOUND" });
        if (payload.kind === "category") await assertCategoryParentIsValid(trx, id, payload.parent_id);
        const slug = slugifyContent(payload.slug ?? payload.name);
        const conflict = await trx.from(table).where("slug", slug).whereNot("id", id).first();
        if (conflict) throw new Exception("Slug already exists", { status: 409, code: "E_CONTENT_SLUG_CONFLICT" });
        const values: Record<string, unknown> = {
            name: payload.name.trim(),
            slug,
            description: payload.description ?? null,
            updated_at: DateTime.utc().toISO(),
        };
        if (payload.kind === "category")
            Object.assign(values, {
                parent_id: payload.parent_id ?? null,
                position: payload.position ?? 0,
                is_active: payload.is_active ?? true,
            });
        const rows = (await trx.from(table).where("id", id).update(values).returning("*")) as DbRow[];
        return { data: rows[0] };
    }

    async deleteTaxonomy(kind: "category" | "tag", id: number) {
        const trx = currentTrx();
        const table = kind === "category" ? "content_categories" : "content_tags";
        const pivot = kind === "category" ? "content_post_categories" : "content_post_tags";
        const foreign = kind === "category" ? "category_id" : "tag_id";
        const used = await trx.from(pivot).where(foreign, id).count("post_id as count").first();
        if (numeric((used as DbRow | undefined)?.count) > 0)
            throw new Exception("Taxonomy item is in use", { status: 409, code: "E_CONTENT_TAXONOMY_IN_USE" });
        if (kind === "category" && (await trx.from("content_categories").where("parent_id", id).first())) {
            throw new Exception("Move or delete child categories first", {
                status: 409,
                code: "E_CONTENT_TAXONOMY_HAS_CHILDREN",
            });
        }
        const deleted = await trx.from(table).where("id", id).delete();
        if (affectedRows(deleted) !== 1) throw new Exception("Taxonomy item not found", { status: 404, code: "E_NOT_FOUND" });
    }

    async sources() {
        const rows = await currentTrx().from("content_sources").orderBy("status", "asc").orderBy("name", "asc");
        return {
            data: (rows as DbRow[]).map((row) => ({
                ...row,
                id: numeric(row.id),
                trust_score: numeric(row.trust_score),
                crawl_interval_minutes: numeric(row.crawl_interval_minutes),
                error_count: numeric(row.error_count),
                topics: asJson(row.topics, []),
                last_fetched_at: iso(row.last_fetched_at),
                next_fetch_at: iso(row.next_fetch_at),
                created_at: iso(row.created_at),
                updated_at: iso(row.updated_at),
            })),
        };
    }

    async createSource(payload: Record<string, unknown>, actorId: number | null) {
        const trx = currentTrx();
        await lockContentNamespace(trx);
        validateContentSourcePayload(payload);
        if (
            await trx
                .from("content_sources")
                .whereRaw("LOWER(name) = LOWER(?)", [String(payload.name)])
                .first()
        ) {
            throw new Exception("Source name already exists", { status: 409, code: "E_CONTENT_SOURCE_EXISTS" });
        }
        const status = String(payload.status ?? "active");
        const rows = (await trx
            .table("content_sources")
            .insert({
                tenant_id: String(currentTenantId()),
                name: payload.name,
                url: payload.url ?? null,
                feed_url: payload.feed_url ?? null,
                source_type: payload.source_type,
                status,
                trust_score: payload.trust_score ?? 50,
                topics: JSON.stringify(payload.topics ?? []),
                crawl_interval_minutes: payload.crawl_interval_minutes ?? 360,
                next_fetch_at: status === "active" ? DateTime.utc().toISO() : null,
                created_by_user_id: actorId,
            })
            .returning("*")) as DbRow[];
        return { data: rows[0] };
    }

    async updateSource(id: number, payload: Record<string, unknown>) {
        const trx = currentTrx();
        await lockContentNamespace(trx);
        validateContentSourcePayload(payload);
        if (
            await trx
                .from("content_sources")
                .whereRaw("LOWER(name) = LOWER(?)", [String(payload.name)])
                .whereNot("id", id)
                .first()
        ) {
            throw new Exception("Source name already exists", { status: 409, code: "E_CONTENT_SOURCE_EXISTS" });
        }
        const rows = (await trx
            .from("content_sources")
            .where("id", id)
            .update({
                name: payload.name,
                url: payload.url ?? null,
                feed_url: payload.feed_url ?? null,
                source_type: payload.source_type,
                status: payload.status ?? "active",
                trust_score: payload.trust_score ?? 50,
                topics: JSON.stringify(payload.topics ?? []),
                crawl_interval_minutes: payload.crawl_interval_minutes ?? 360,
                next_fetch_at: payload.status === "active" ? DateTime.utc().toISO() : null,
                updated_at: DateTime.utc().toISO(),
            })
            .returning("*")) as DbRow[];
        if (!rows[0]) throw new Exception("Content source not found", { status: 404, code: "E_NOT_FOUND" });
        return { data: rows[0] };
    }

    async deleteSource(id: number) {
        const deleted = await currentTrx().from("content_sources").where("id", id).delete();
        if (affectedRows(deleted) !== 1) throw new Exception("Content source not found", { status: 404, code: "E_NOT_FOUND" });
    }

    async signals(input: {
        page?: number;
        limit?: number;
        q?: string;
        status?: string;
        source_id?: number;
        min_opportunity?: number;
    }) {
        const trx = currentTrx();
        const page = input.page ?? 1;
        const limit = input.limit ?? 25;
        const query = trx.from("content_signals as g").leftJoin("content_sources as s", "s.id", "g.source_id");
        if (input.q) {
            const needle = `%${escapeLike(normalizePersian(input.q).toLowerCase())}%`;
            query.where((builder) =>
                builder
                    .whereRaw("LOWER(g.title) LIKE ? ESCAPE E'\\\\'", [needle])
                    .orWhereRaw("LOWER(COALESCE(g.summary, '')) LIKE ? ESCAPE E'\\\\'", [needle]),
            );
        }
        if (input.status) query.where("g.status", input.status);
        if (input.source_id) query.where("g.source_id", input.source_id);
        if (input.min_opportunity !== undefined) query.where("g.opportunity_score", ">=", input.min_opportunity);
        const [count, rows] = await Promise.all([
            query.clone().clearSelect().clearOrder().countDistinct({ total: "g.id" }).first(),
            query
                .clone()
                .select("g.*", "s.name as source_name", "s.url as source_home_url")
                .orderBy("g.opportunity_score", "desc")
                .orderBy("g.published_at", "desc")
                .limit(limit)
                .offset((page - 1) * limit),
        ]);
        const total = numeric((count as DbRow | undefined)?.total);
        return {
            data: (rows as DbRow[]).map((row) => ({
                ...row,
                id: numeric(row.id),
                source_id: nullableNumeric(row.source_id),
                source_trust_score: numeric(row.source_trust_score),
                business_relevance_score: numeric(row.business_relevance_score),
                opportunity_score: numeric(row.opportunity_score),
                risk_score: numeric(row.risk_score),
                metadata: asJson(row.metadata, {}),
                published_at: iso(row.published_at),
                fetched_at: iso(row.fetched_at),
                created_at: iso(row.created_at),
                updated_at: iso(row.updated_at),
            })),
            meta: { page, limit, total, last_page: Math.max(1, Math.ceil(total / limit)) },
        };
    }

    async createSignal(payload: Record<string, unknown>) {
        const trx = currentTrx();
        let sourceTrust = numeric(payload.source_trust_score ?? 50);
        if (payload.source_id) {
            const source = (await trx.from("content_sources").where("id", numeric(payload.source_id)).first()) as
                | DbRow
                | undefined;
            if (!source) throw new Exception("Content source not found", { status: 422, code: "E_CONTENT_SOURCE_INVALID" });
            sourceTrust = numeric(payload.source_trust_score ?? source.trust_score);
        }
        const fingerprint = signalFingerprint({
            url: payload.url ? String(payload.url) : null,
            title: String(payload.title),
            publishedAt: payload.published_at ? String(payload.published_at) : null,
        });
        const rows = (await trx
            .table("content_signals")
            .insert({
                tenant_id: String(currentTenantId()),
                source_id: payload.source_id ?? null,
                url: payload.url ?? null,
                title: payload.title,
                summary: payload.summary ?? null,
                language: payload.language ?? "fa",
                topic: payload.topic ?? null,
                fingerprint,
                source_trust_score: sourceTrust,
                business_relevance_score: payload.business_relevance_score ?? 0,
                opportunity_score: payload.opportunity_score ?? 0,
                risk_score: payload.risk_score ?? 0,
                sentiment: payload.sentiment ?? "neutral",
                published_at: parseDate(payload.published_at ? String(payload.published_at) : null, "published_at"),
            })
            .onConflict(["tenant_id", "fingerprint"])
            .ignore()
            .returning("*")) as DbRow[];
        if (rows[0]) return { data: rows[0], deduplicated: false };
        const existing = await trx.from("content_signals").where("fingerprint", fingerprint).first();
        if (!existing)
            throw new Exception("Content signal could not be created", { status: 500, code: "E_CONTENT_SIGNAL_CREATE" });
        return { data: existing, deduplicated: true };
    }

    async updateSignalStatus(id: number, status: "reviewed" | "ignored") {
        const trx = currentTrx();
        const signal = (await trx.from("content_signals").where("id", id).forUpdate().first()) as DbRow | undefined;
        if (!signal) throw new Exception("Content signal not found", { status: 404, code: "E_NOT_FOUND" });
        if (signal.status === "converted")
            throw new Exception("Converted signals cannot be changed", { status: 409, code: "E_CONTENT_SIGNAL_CONVERTED" });
        const rows = (await trx
            .from("content_signals")
            .where("id", id)
            .update({ status, updated_at: DateTime.utc().toISO() })
            .returning("*")) as DbRow[];
        return { data: rows[0] };
    }

    async signalToDraft(id: number, actorId: number | null) {
        const trx = currentTrx();
        await lockContentNamespace(trx);
        const signal = (await trx.from("content_signals").where("id", id).forUpdate().first()) as DbRow | undefined;
        if (!signal) throw new Exception("Content signal not found", { status: 404, code: "E_NOT_FOUND" });
        if (signal.status === "converted")
            throw new Exception("Signal already converted", { status: 409, code: "E_CONTENT_SIGNAL_CONVERTED" });
        if (signal.status === "ignored")
            throw new Exception("Ignored signal must be reviewed before conversion", {
                status: 409,
                code: "E_CONTENT_SIGNAL_IGNORED",
            });
        const settings = await this.settings();
        const requiresReview =
            numeric(signal.source_trust_score) < settings.minimum_source_trust || numeric(signal.risk_score) >= 70;
        if (requiresReview && signal.status !== "reviewed") {
            throw new Exception("Low-trust or high-risk signals must be reviewed before conversion", {
                status: 409,
                code: "E_CONTENT_SIGNAL_REVIEW_REQUIRED",
            });
        }
        return this.create(
            {
                type: "news",
                locale: String(signal.language ?? "fa") as "fa" | "en",
                title: String(signal.title),
                excerpt: signal.summary ? String(signal.summary) : null,
                content_html: signal.summary ? `<p>${String(signal.summary)}</p>` : "",
                source_signal_id: id,
                schema_type: "NewsArticle",
                status: "draft",
            },
            actorId,
        );
    }

    async resources(kind: "products" | "orders" | "users" | "media", q = "", limit = 20, locale: "fa" | "en" = "fa") {
        const trx = currentTrx();
        const needle = `%${escapeLike(normalizePersian(q).toLowerCase())}%`;
        if (kind === "products") {
            const rows = await trx
                .from("products as p")
                .leftJoin("product_translations as tr", function joinTr() {
                    this.on("tr.product_id", "=", "p.id").andOnVal("tr.locale", "=", locale);
                })
                .whereNull("p.deleted_at")
                .where((query) =>
                    query
                        .whereRaw("LOWER(COALESCE(tr.name, '')) LIKE ? ESCAPE E'\\\\'", [needle])
                        .orWhereRaw("LOWER(COALESCE(p.sku, '')) LIKE ? ESCAPE E'\\\\'", [needle]),
                )
                .select("p.id", "p.sku", "tr.slug as slug", "p.status", "tr.name")
                .orderBy("p.updated_at", "desc")
                .limit(limit);
            return { data: (rows as DbRow[]).map((row) => ({ ...row, id: numeric(row.id) })) };
        }
        if (kind === "orders") {
            const rows = await trx
                .from("orders as o")
                .leftJoin("customers as c", "c.id", "o.customer_id")
                .where("o.status", "completed")
                .whereNull("o.deleted_at")
                .where((query) =>
                    query
                        .whereRaw("LOWER(CAST(o.order_number AS TEXT)) LIKE ? ESCAPE E'\\\\'", [needle])
                        .orWhereRaw(
                            "LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ? ESCAPE E'\\\\'",
                            [needle],
                        ),
                )
                .select(
                    "o.id",
                    "o.order_number",
                    "o.status",
                    "o.grand_total",
                    "o.currency",
                    "o.created_at",
                    "c.first_name",
                    "c.last_name",
                )
                .orderBy("o.created_at", "desc")
                .limit(limit);
            return {
                data: (rows as DbRow[]).map((row) => ({
                    ...row,
                    id: numeric(row.id),
                    grand_total: numeric(row.grand_total),
                    created_at: iso(row.created_at),
                })),
            };
        }
        if (kind === "users") {
            const rows = await trx
                .from("users")
                .where((query) => query.whereRaw("LOWER(COALESCE(email, '')) LIKE ? ESCAPE E'\\\\'", [needle]))
                .select("id", "email", "role", "locale")
                .orderBy("id", "asc")
                .limit(limit);
            return { data: (rows as DbRow[]).map((row) => ({ ...row, id: numeric(row.id) })) };
        }
        const rows = await trx
            .from("media")
            .where((query) =>
                query
                    .whereRaw("LOWER(COALESCE(title, '')) LIKE ? ESCAPE E'\\\\'", [needle])
                    .orWhereRaw("LOWER(COALESCE(filename, '')) LIKE ? ESCAPE E'\\\\'", [needle]),
            )
            .select("id", "title", "filename", "url", "alt", "mime", "width", "height")
            .orderBy("created_at", "desc")
            .limit(limit);
        return {
            data: (rows as DbRow[]).map((row) => ({
                ...row,
                id: numeric(row.id),
                width: nullableNumeric(row.width),
                height: nullableNumeric(row.height),
            })),
        };
    }

    async applyAgentDraft(
        runId: number,
        draft: {
            title: string;
            excerpt?: string | null;
            content_html: string;
            seo_title?: string | null;
            meta_description?: string | null;
            focus_keyword?: string | null;
        },
        actorId: number | null,
        targetPostId?: number | null,
    ) {
        const trx = currentTrx();
        if (targetPostId) {
            const current = (await trx
                .from("content_posts")
                .where("id", targetPostId)
                .whereNull("deleted_at")
                .forUpdate()
                .first()) as DbRow | undefined;
            if (!current) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
            const linked = (await relationMap(trx, [targetPostId])).get(targetPostId) ?? {
                categories: [],
                tags: [],
                products: [],
            };
            return this.update(
                targetPostId,
                {
                    type: String(current.type) as ContentType,
                    locale: String(current.locale ?? "fa") as "fa" | "en",
                    title: draft.title,
                    slug: String(current.slug),
                    excerpt: draft.excerpt ?? null,
                    content_html: draft.content_html,
                    featured_media_id: nullableNumeric(current.featured_media_id),
                    author_user_id: nullableNumeric(current.author_user_id) ?? actorId,
                    reviewer_user_id: nullableNumeric(current.reviewer_user_id),
                    source_signal_id: nullableNumeric(current.source_signal_id),
                    seo_title: draft.seo_title ?? null,
                    meta_description: draft.meta_description ?? null,
                    canonical_url: current.canonical_url ? String(current.canonical_url) : null,
                    robots_index: current.robots_index !== false,
                    robots_follow: current.robots_follow !== false,
                    schema_type: String(current.schema_type ?? "BlogPosting") as ContentPostInput["schema_type"],
                    search_intent: (current.search_intent
                        ? String(current.search_intent)
                        : null) as ContentPostInput["search_intent"],
                    focus_keyword: draft.focus_keyword ?? null,
                    structured_data: asJson(current.structured_data, {}),
                    scheduled_at: iso(current.scheduled_at),
                    category_ids: linked.categories.map((item) => numeric(item.id)),
                    tag_ids: linked.tags.map((item) => numeric(item.id)),
                    product_ids: linked.products.map((item) => numeric(item.id)),
                    change_summary: `اعمال خروجی Agent شماره ${runId}`,
                    expected_version: numeric(current.version),
                },
                actorId,
            );
        }
        return this.create(
            {
                type: "article",
                locale: "fa",
                title: draft.title,
                excerpt: draft.excerpt ?? null,
                content_html: draft.content_html,
                seo_title: draft.seo_title ?? null,
                meta_description: draft.meta_description ?? null,
                focus_keyword: draft.focus_keyword ?? null,
                schema_type: "BlogPosting",
                status: "draft",
                change_summary: `ایجاد از خروجی Agent شماره ${runId}`,
            },
            actorId,
        );
    }

    async publishDue(): Promise<number> {
        const settings = await this.settings();
        if (!settings.auto_publish_due) return 0;
        const trx = currentTrx();
        const rows = (await trx
            .from("content_posts")
            .where("status", "scheduled")
            .where("scheduled_at", "<=", DateTime.utc().toISO())
            .forUpdate()
            .select("id", "version", "quality_score")) as DbRow[];
        let published = 0;
        for (const row of rows) {
            if (numeric(row.quality_score) < numeric(settings.minimum_publish_quality)) {
                await recordEvent(trx, numeric(row.id), null, "content.schedule_blocked", { reason: "quality_gate" });
                continue;
            }
            await trx
                .from("content_posts")
                .where("id", numeric(row.id))
                .update({
                    status: "published",
                    published_at: DateTime.utc().toISO(),
                    scheduled_at: null,
                    version: numeric(row.version) + 1,
                    updated_at: DateTime.utc().toISO(),
                });
            await recordEvent(trx, numeric(row.id), null, "content.published_by_schedule");
            published += 1;
        }
        return published;
    }

    async publicList(input: { page?: number; limit?: number; type?: string; category?: string; q?: string; locale?: string }) {
        const page = input.page ?? 1;
        const limit = input.limit ?? 12;
        const query = currentTrx()
            .from("content_posts as p")
            .leftJoin("media as fm", "fm.id", "p.featured_media_id")
            .where("p.status", "published")
            .whereNull("p.deleted_at");
        if (input.type) query.where("p.type", input.type);
        if (input.locale) query.where("p.locale", input.locale);
        if (input.category)
            query.whereExists(
                currentTrx()
                    .from("content_post_categories as pc")
                    .join("content_categories as c", "c.id", "pc.category_id")
                    .select(1)
                    .whereRaw("pc.post_id = p.id")
                    .where("c.slug", input.category),
            );
        if (input.q) {
            const needle = `%${escapeLike(normalizePersian(input.q).toLowerCase())}%`;
            query.where((builder) =>
                builder
                    .whereRaw("LOWER(p.title) LIKE ? ESCAPE E'\\\\'", [needle])
                    .orWhereRaw("LOWER(COALESCE(p.excerpt, '')) LIKE ? ESCAPE E'\\\\'", [needle]),
            );
        }
        const [count, rows] = await Promise.all([
            query.clone().clearSelect().clearOrder().countDistinct({ total: "p.id" }).first(),
            query
                .clone()
                .select(
                    "p.id",
                    "p.type",
                    "p.locale",
                    "p.title",
                    "p.slug",
                    "p.excerpt",
                    "p.published_at",
                    "p.updated_at",
                    "p.reading_time_minutes",
                    "fm.url as featured_media_url",
                    "fm.alt as featured_media_alt",
                )
                .orderBy("p.published_at", "desc")
                .limit(limit)
                .offset((page - 1) * limit),
        ]);
        const total = numeric((count as DbRow | undefined)?.total);
        return {
            data: (rows as DbRow[]).map((row) => ({
                ...row,
                id: numeric(row.id),
                reading_time_minutes: numeric(row.reading_time_minutes),
                published_at: iso(row.published_at),
                updated_at: iso(row.updated_at),
            })),
            meta: { page, limit, total, last_page: Math.max(1, Math.ceil(total / limit)) },
        };
    }

    async publicDetail(slug: string, locale = "fa") {
        const trx = currentTrx();
        const row = (await trx
            .from("content_posts as p")
            .leftJoin("media as fm", "fm.id", "p.featured_media_id")
            .where("p.slug", slug)
            .where("p.locale", locale)
            .where("p.status", "published")
            .whereNull("p.deleted_at")
            .select("p.*", "fm.url as featured_media_url", "fm.alt as featured_media_alt")
            .first()) as DbRow | undefined;
        if (!row) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        const id = numeric(row.id);
        const relations = await relationMap(trx, [id], { publishedProductsOnly: true, locale: locale as "fa" | "en" });
        return {
            data: {
                ...serializePostBase(row),
                featured_media: row.featured_media_url
                    ? {
                          id: nullableNumeric(row.featured_media_id),
                          url: row.featured_media_url,
                          alt: row.featured_media_alt ?? null,
                      }
                    : null,
                ...(relations.get(id) ?? { categories: [], tags: [], products: [] }),
            },
        };
    }

    async trackPublicEvent(input: {
        post_id: number;
        product_id?: number | null;
        event_type: "view" | "product_click" | "add_to_cart";
        session_key?: string | null;
        metadata?: Record<string, unknown>;
    }) {
        const trx = currentTrx();
        const post = await trx
            .from("content_posts")
            .where("id", input.post_id)
            .where("status", "published")
            .whereNull("deleted_at")
            .first();
        if (!post) throw new Exception("Content post not found", { status: 404, code: "E_NOT_FOUND" });
        if (input.event_type === "view" && !input.session_key) {
            throw new Exception("A content session is required for view events", {
                status: 422,
                code: "E_CONTENT_SESSION_REQUIRED",
            });
        }
        if (input.product_id) {
            const linked = await trx
                .from("content_post_products")
                .where("post_id", input.post_id)
                .where("product_id", input.product_id)
                .first();
            if (!linked)
                throw new Exception("Product is not linked to this content", {
                    status: 422,
                    code: "E_CONTENT_PRODUCT_NOT_LINKED",
                });
        }
        const metadata = JSON.stringify(input.metadata ?? {});
        if (metadata.length > 4_000)
            throw new Exception("Event metadata is too large", { status: 422, code: "E_CONTENT_EVENT_METADATA_TOO_LARGE" });
        const insert = trx.table("content_attribution_events").insert({
            tenant_id: String(currentTenantId()),
            post_id: input.post_id,
            product_id: input.product_id ?? null,
            event_type: input.event_type,
            session_key: input.session_key ?? null,
            metadata,
        });
        const inserted =
            input.event_type === "view" && input.session_key
                ? await insert.onConflict().ignore().returning("id")
                : await insert.returning("id");
        const accepted = Array.isArray(inserted) && inserted.length > 0;
        if (accepted) {
            const patch =
                input.event_type === "view"
                    ? { views_count: trx.raw("views_count + 1") }
                    : input.event_type === "product_click"
                      ? { product_clicks_count: trx.raw("product_clicks_count + 1") }
                      : {};
            if (Object.keys(patch).length > 0) await trx.from("content_posts").where("id", input.post_id).update(patch);
        }
        return { data: { accepted, deduplicated: !accepted } };
    }
}

export const contentService = new ContentService();
