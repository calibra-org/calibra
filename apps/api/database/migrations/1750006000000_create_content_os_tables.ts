import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

/**
 * Tenant-scoped Content OS storage. The module is deliberately additive: no existing Calibra
 * table is rewritten, and commerce connections are represented by explicit relation tables.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.createTable("content_sources", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 180).notNullable();
            table.text("url").nullable();
            table.text("feed_url").nullable();
            table.string("source_type", 24).notNullable().defaultTo("website");
            table.string("status", 24).notNullable().defaultTo("active");
            table.integer("trust_score").notNullable().defaultTo(50);
            table.jsonb("topics").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("crawl_interval_minutes").notNullable().defaultTo(360);
            table.timestamp("last_fetched_at", { useTz: true }).nullable();
            table.timestamp("next_fetch_at", { useTz: true }).nullable();
            table.integer("error_count").notNullable().defaultTo(0);
            table.text("last_error").nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "name"], { indexName: "content_sources_tenant_name_unique" });
            table.index(["tenant_id", "status", "next_fetch_at"], "content_sources_tenant_schedule_idx");
        });

        this.schema.createTable("content_signals", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("source_id").unsigned().nullable().references("id").inTable("content_sources").onDelete("SET NULL");
            table.string("external_id", 255).nullable();
            table.text("url").nullable();
            table.string("title", 500).notNullable();
            table.text("summary").nullable();
            table.string("language", 12).notNullable().defaultTo("fa");
            table.string("topic", 120).nullable();
            table.string("fingerprint", 64).notNullable();
            table.integer("source_trust_score").notNullable().defaultTo(50);
            table.integer("business_relevance_score").notNullable().defaultTo(0);
            table.integer("opportunity_score").notNullable().defaultTo(0);
            table.integer("risk_score").notNullable().defaultTo(0);
            table.string("sentiment", 16).notNullable().defaultTo("neutral");
            table.string("status", 24).notNullable().defaultTo("new");
            table.timestamp("published_at", { useTz: true }).nullable();
            table.timestamp("fetched_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "fingerprint"], { indexName: "content_signals_tenant_fingerprint_unique" });
            table.index(["tenant_id", "status", "opportunity_score"], "content_signals_tenant_status_opportunity_idx");
            table.index(["source_id", "published_at"], "content_signals_source_published_idx");
        });

        this.schema.createTable("content_categories", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("parent_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("content_categories")
                .onDelete("SET NULL");
            table.string("name", 180).notNullable();
            table.string("slug", 191).notNullable();
            table.text("description").nullable();
            table.integer("position").notNullable().defaultTo(0);
            table.boolean("is_active").notNullable().defaultTo(true);
            table.timestamps(true, true);
            table.unique(["tenant_id", "slug"], { indexName: "content_categories_tenant_slug_unique" });
            table.index(["tenant_id", "parent_id", "position"], "content_categories_tree_idx");
        });

        this.schema.createTable("content_tags", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 120).notNullable();
            table.string("slug", 191).notNullable();
            table.text("description").nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "slug"], { indexName: "content_tags_tenant_slug_unique" });
        });

        this.schema.createTable("content_posts", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("type", 24).notNullable().defaultTo("article");
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("locale", 12).notNullable().defaultTo("fa");
            table.string("title", 500).notNullable();
            table.string("slug", 191).notNullable();
            table.text("excerpt").nullable();
            table.text("content_html").notNullable().defaultTo("");
            table.bigInteger("featured_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.bigInteger("author_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewer_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table
                .bigInteger("source_signal_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("content_signals")
                .onDelete("SET NULL");
            table.string("seo_title", 255).nullable();
            table.string("meta_description", 500).nullable();
            table.text("canonical_url").nullable();
            table.boolean("robots_index").notNullable().defaultTo(true);
            table.boolean("robots_follow").notNullable().defaultTo(true);
            table.string("schema_type", 40).notNullable().defaultTo("BlogPosting");
            table.string("search_intent", 40).nullable();
            table.string("focus_keyword", 180).nullable();
            table.jsonb("structured_data").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("scheduled_at", { useTz: true }).nullable();
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("published_at", { useTz: true }).nullable();
            table.timestamp("archived_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.integer("word_count").notNullable().defaultTo(0);
            table.integer("reading_time_minutes").notNullable().defaultTo(0);
            table.integer("seo_score").notNullable().defaultTo(0);
            table.integer("quality_score").notNullable().defaultTo(0);
            table.integer("commerce_score").notNullable().defaultTo(0);
            table.bigInteger("views_count").notNullable().defaultTo(0);
            table.bigInteger("product_clicks_count").notNullable().defaultTo(0);
            table.bigInteger("assisted_orders_count").notNullable().defaultTo(0);
            table.bigInteger("assisted_revenue_minor").notNullable().defaultTo(0);
            table.timestamp("deleted_at", { useTz: true }).nullable();
            table.timestamps(true, true);
        });
        this.schema.raw(
            `CREATE UNIQUE INDEX content_posts_tenant_locale_slug_unique ON content_posts (tenant_id, locale, slug) WHERE deleted_at IS NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX content_posts_tenant_source_signal_unique ON content_posts (tenant_id, source_signal_id) WHERE source_signal_id IS NOT NULL AND deleted_at IS NULL`,
        );
        this.schema.raw(
            `CREATE INDEX content_posts_tenant_status_published_idx ON content_posts (tenant_id, status, published_at DESC)`,
        );
        this.schema.raw(
            `CREATE INDEX content_posts_tenant_schedule_idx ON content_posts (tenant_id, scheduled_at) WHERE status = 'scheduled'`,
        );

        this.schema.createTable("content_post_categories", (table) => {
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().notNullable().references("id").inTable("content_posts").onDelete("CASCADE");
            table
                .bigInteger("category_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("content_categories")
                .onDelete("CASCADE");
            table.primary(["post_id", "category_id"]);
            table.index(["tenant_id", "category_id"], "content_post_categories_tenant_category_idx");
        });

        this.schema.createTable("content_post_tags", (table) => {
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().notNullable().references("id").inTable("content_posts").onDelete("CASCADE");
            table.bigInteger("tag_id").unsigned().notNullable().references("id").inTable("content_tags").onDelete("CASCADE");
            table.primary(["post_id", "tag_id"]);
            table.index(["tenant_id", "tag_id"], "content_post_tags_tenant_tag_idx");
        });

        this.schema.createTable("content_post_products", (table) => {
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().notNullable().references("id").inTable("content_posts").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.string("relation_type", 24).notNullable().defaultTo("related");
            table.integer("position").notNullable().defaultTo(0);
            table.primary(["post_id", "product_id"]);
            table.index(["tenant_id", "product_id"], "content_post_products_tenant_product_idx");
        });

        this.schema.createTable("content_revisions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().notNullable().references("id").inTable("content_posts").onDelete("CASCADE");
            table.integer("version").notNullable();
            table.jsonb("snapshot").notNullable();
            table.text("change_summary").nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["post_id", "version"], { indexName: "content_revisions_post_version_unique" });
            table.index(["tenant_id", "post_id", "created_at"], "content_revisions_tenant_post_idx");
        });

        this.schema.createTable("content_agent_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().nullable().references("id").inTable("content_posts").onDelete("SET NULL");
            table.bigInteger("signal_id").unsigned().nullable().references("id").inTable("content_signals").onDelete("SET NULL");
            table.string("agent_kind", 40).notNullable();
            table.string("status", 24).notNullable().defaultTo("queued");
            table.string("model", 80).nullable();
            table.jsonb("input").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("output").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.boolean("human_review_required").notNullable().defaultTo(true);
            table.bigInteger("requested_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("applied_at", { useTz: true }).nullable();
            table
                .bigInteger("applied_post_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("content_posts")
                .onDelete("SET NULL");
            table.text("review_note").nullable();
            table.text("error_message").nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "content_agent_runs_tenant_status_idx");
        });

        this.schema.createTable("content_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().nullable().references("id").inTable("content_posts").onDelete("CASCADE");
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("event_type", 64).notNullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "post_id", "created_at"], "content_events_tenant_post_idx");
        });

        this.schema.createTable("content_attribution_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("post_id").unsigned().notNullable().references("id").inTable("content_posts").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.string("event_type", 32).notNullable();
            table.string("session_key", 80).nullable();
            table.bigInteger("value_minor").notNullable().defaultTo(0);
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "post_id", "occurred_at"], "content_attribution_post_idx");
            table.index(["tenant_id", "order_id"], "content_attribution_order_idx");
        });
        this.schema.raw(
            `CREATE UNIQUE INDEX content_attribution_unique_assisted_order ON content_attribution_events (tenant_id, order_id) WHERE event_type = 'order_assisted' AND order_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX content_attribution_unique_session_view ON content_attribution_events (tenant_id, post_id, session_key) WHERE event_type = 'view' AND session_key IS NOT NULL`,
        );

        const checks = [
            `ALTER TABLE content_sources ADD CONSTRAINT content_sources_type_check CHECK (source_type IN ('rss','atom','website','api','manual'))`,
            `ALTER TABLE content_sources ADD CONSTRAINT content_sources_status_check CHECK (status IN ('active','paused','error','fetching'))`,
            `ALTER TABLE content_sources ADD CONSTRAINT content_sources_scores_check CHECK (trust_score BETWEEN 0 AND 100 AND crawl_interval_minutes BETWEEN 15 AND 43200)`,
            `ALTER TABLE content_signals ADD CONSTRAINT content_signals_status_check CHECK (status IN ('new','reviewed','converted','ignored'))`,
            `ALTER TABLE content_signals ADD CONSTRAINT content_signals_sentiment_check CHECK (sentiment IN ('positive','neutral','negative','mixed'))`,
            `ALTER TABLE content_signals ADD CONSTRAINT content_signals_scores_check CHECK (source_trust_score BETWEEN 0 AND 100 AND business_relevance_score BETWEEN 0 AND 100 AND opportunity_score BETWEEN 0 AND 100 AND risk_score BETWEEN 0 AND 100)`,
            `ALTER TABLE content_posts ADD CONSTRAINT content_posts_type_check CHECK (type IN ('article','news','guide','case_study','landing'))`,
            `ALTER TABLE content_posts ADD CONSTRAINT content_posts_status_check CHECK (status IN ('draft','in_review','approved','scheduled','published','archived'))`,
            `ALTER TABLE content_posts ADD CONSTRAINT content_posts_scores_check CHECK (seo_score BETWEEN 0 AND 100 AND quality_score BETWEEN 0 AND 100 AND commerce_score BETWEEN 0 AND 100)`,
            `ALTER TABLE content_posts ADD CONSTRAINT content_posts_counters_check CHECK (version >= 1 AND word_count >= 0 AND reading_time_minutes >= 0 AND views_count >= 0 AND product_clicks_count >= 0 AND assisted_orders_count >= 0 AND assisted_revenue_minor >= 0)`,
            `ALTER TABLE content_post_products ADD CONSTRAINT content_post_products_relation_check CHECK (relation_type IN ('primary','related','cta','mentioned'))`,
            `ALTER TABLE content_agent_runs ADD CONSTRAINT content_agent_runs_kind_check CHECK (agent_kind IN ('trend_scout','source_intelligence','strategist','writer','editor','seo','commerce','governance','publisher','refresh'))`,
            `ALTER TABLE content_agent_runs ADD CONSTRAINT content_agent_runs_status_check CHECK (status IN ('queued','running','completed','failed','blocked','approved','rejected'))`,
            `ALTER TABLE content_attribution_events ADD CONSTRAINT content_attribution_event_type_check CHECK (event_type IN ('view','product_click','add_to_cart','order_assisted'))`,
            `ALTER TABLE content_attribution_events ADD CONSTRAINT content_attribution_value_check CHECK (value_minor >= 0)`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tenantTables = [
            "content_sources",
            "content_signals",
            "content_categories",
            "content_tags",
            "content_posts",
            "content_post_categories",
            "content_post_tags",
            "content_post_products",
            "content_revisions",
            "content_agent_runs",
            "content_events",
            "content_attribution_events",
        ];
        for (const table of tenantTables) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }
    }

    async down() {
        const tables = [
            "content_attribution_events",
            "content_events",
            "content_agent_runs",
            "content_revisions",
            "content_post_products",
            "content_post_tags",
            "content_post_categories",
            "content_posts",
            "content_tags",
            "content_categories",
            "content_signals",
            "content_sources",
        ];
        for (const table of tables) this.schema.dropTable(table);
    }
}
