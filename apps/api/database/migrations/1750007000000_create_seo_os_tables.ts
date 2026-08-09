import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

/**
 * Additive, tenant-scoped storage for the Calibra SEO control plane.
 * Existing catalog, content, order, media, and factor tables are not rewritten.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.createTable("seo_entity_profiles", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("entity_kind", 32).notNullable();
            table.bigInteger("entity_id").unsigned().nullable();
            table.string("entity_key", 191).notNullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("engine_profile", 8).notNullable().defaultTo("k20");
            table.string("meta_title", 255).nullable();
            table.text("meta_description").nullable();
            table.string("focus_keyword", 180).nullable();
            table.jsonb("secondary_keywords").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("canonical_url").nullable();
            table.boolean("robots_index").notNullable().defaultTo(true);
            table.boolean("robots_follow").notNullable().defaultTo(true);
            table.string("og_title", 255).nullable();
            table.text("og_description").nullable();
            table.bigInteger("social_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.string("schema_type", 80).nullable();
            table.jsonb("schema_overrides").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("score_total").notNullable().defaultTo(0);
            table.integer("score_technical").notNullable().defaultTo(0);
            table.integer("score_content").notNullable().defaultTo(0);
            table.integer("score_schema").notNullable().defaultTo(0);
            table.integer("score_media").notNullable().defaultTo(0);
            table.integer("score_commerce").notNullable().defaultTo(0);
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "entity_kind", "entity_key", "locale"], {
                indexName: "seo_profiles_entity_locale_unique",
            });
            table.index(["tenant_id", "entity_kind", "score_total"], "seo_profiles_kind_score_idx");
        });

        this.schema.createTable("seo_audit_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("kind", 32).notNullable().defaultTo("full");
            table.string("status", 24).notNullable().defaultTo("queued");
            table.string("engine_profile", 8).notNullable().defaultTo("k20");
            table.jsonb("scope").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("counters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("result_summary").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("error_message").nullable();
            table.bigInteger("requested_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "seo_audit_runs_status_idx");
        });

        this.schema.createTable("seo_issues", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("profile_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("seo_entity_profiles")
                .onDelete("CASCADE");
            table
                .bigInteger("audit_run_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("seo_audit_runs")
                .onDelete("SET NULL");
            table.string("entity_kind", 32).notNullable();
            table.bigInteger("entity_id").unsigned().nullable();
            table.string("entity_key", 191).notNullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("rule_code", 120).notNullable();
            table.string("severity", 16).notNullable();
            table.string("status", 24).notNullable().defaultTo("open");
            table.string("title", 255).notNullable();
            table.text("description").notNullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("suggested_fix").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("first_seen_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("resolved_at", { useTz: true }).nullable();
            table.bigInteger("resolved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "entity_kind", "entity_key", "locale", "rule_code"], {
                indexName: "seo_issues_entity_rule_unique",
            });
            table.index(["tenant_id", "status", "severity"], "seo_issues_status_severity_idx");
        });

        this.schema.createTable("seo_keywords", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("phrase", 255).notNullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("target_entity_kind", 32).nullable();
            table.bigInteger("target_entity_id").unsigned().nullable();
            table.text("target_url").nullable();
            table.string("search_engine", 24).notNullable().defaultTo("google");
            table.string("country", 2).nullable();
            table.string("city", 120).nullable();
            table.string("device", 16).notNullable().defaultTo("desktop");
            table.integer("current_position").nullable();
            table.integer("previous_position").nullable();
            table.integer("best_position").nullable();
            table.integer("search_volume").nullable();
            table.integer("difficulty").nullable();
            table.string("source", 32).notNullable().defaultTo("manual");
            table.timestamp("last_checked_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "phrase", "locale", "search_engine", "country", "city", "device"], {
                indexName: "seo_keywords_tracking_unique",
            });
            table.index(["tenant_id", "current_position"], "seo_keywords_position_idx");
        });

        this.schema.createTable("seo_competitors", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("domain", 255).notNullable();
            table.string("label", 180).nullable();
            table.boolean("enabled").notNullable().defaultTo(true);
            table.string("source", 32).notNullable().defaultTo("manual");
            table.jsonb("metrics").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("last_synced_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "domain"], { indexName: "seo_competitors_domain_unique" });
        });

        this.schema.createTable("seo_internal_links", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("source_kind", 32).notNullable();
            table.string("source_key", 191).notNullable();
            table.string("target_kind", 32).notNullable();
            table.string("target_key", 191).notNullable();
            table.string("anchor", 255).notNullable();
            table.string("relation", 32).notNullable().defaultTo("related");
            table.string("status", 24).notNullable().defaultTo("suggested");
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("applied_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("applied_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "source_kind", "source_key", "target_kind", "target_key", "anchor"], {
                indexName: "seo_internal_links_unique",
            });
            table.index(["tenant_id", "status", "source_kind"], "seo_internal_links_status_idx");
        });

        this.schema.createTable("seo_redirects", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("source_path", 2000).notNullable();
            table.string("target_path", 2000).nullable();
            table.integer("status_code").notNullable().defaultTo(301);
            table.boolean("enabled").notNullable().defaultTo(true);
            table.bigInteger("hit_count").notNullable().defaultTo(0);
            table.timestamp("last_hit_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "source_path"], { indexName: "seo_redirects_source_unique" });
            table.index(["tenant_id", "enabled", "status_code"], "seo_redirects_enabled_idx");
        });

        this.schema.createTable("seo_integrations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider", 40).notNullable();
            table.string("status", 24).notNullable().defaultTo("disconnected");
            table.jsonb("configuration").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("credential_env_ref", 180).nullable();
            table.timestamp("last_synced_at", { useTz: true }).nullable();
            table.text("last_error").nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "provider"], { indexName: "seo_integrations_provider_unique" });
        });

        this.schema.createTable("seo_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("event_type", 64).notNullable();
            table.string("entity_kind", 32).nullable();
            table.string("entity_key", 191).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "event_type", "created_at"], "seo_events_type_created_idx");
        });

        const checks = [
            `ALTER TABLE seo_entity_profiles ADD CONSTRAINT seo_profiles_kind_check CHECK (entity_kind IN ('product','category','brand','attribute','content_post','media','page'))`,
            `ALTER TABLE seo_entity_profiles ADD CONSTRAINT seo_profiles_engine_check CHECK (engine_profile IN ('k20','k21'))`,
            `ALTER TABLE seo_entity_profiles ADD CONSTRAINT seo_profiles_scores_check CHECK (score_total BETWEEN 0 AND 100 AND score_technical BETWEEN 0 AND 100 AND score_content BETWEEN 0 AND 100 AND score_schema BETWEEN 0 AND 100 AND score_media BETWEEN 0 AND 100 AND score_commerce BETWEEN 0 AND 100)`,
            `ALTER TABLE seo_entity_profiles ADD CONSTRAINT seo_profiles_version_check CHECK (version >= 1)`,
            `ALTER TABLE seo_audit_runs ADD CONSTRAINT seo_audit_kind_check CHECK (kind IN ('full','entity','technical','crawl','schema','content','media'))`,
            `ALTER TABLE seo_audit_runs ADD CONSTRAINT seo_audit_status_check CHECK (status IN ('queued','running','completed','failed','cancelled'))`,
            `ALTER TABLE seo_audit_runs ADD CONSTRAINT seo_audit_engine_check CHECK (engine_profile IN ('k20','k21'))`,
            `ALTER TABLE seo_issues ADD CONSTRAINT seo_issues_severity_check CHECK (severity IN ('info','warning','critical'))`,
            `ALTER TABLE seo_issues ADD CONSTRAINT seo_issues_status_check CHECK (status IN ('open','ignored','resolved','regressed'))`,
            `ALTER TABLE seo_keywords ADD CONSTRAINT seo_keywords_device_check CHECK (device IN ('desktop','mobile','tablet'))`,
            `ALTER TABLE seo_keywords ADD CONSTRAINT seo_keywords_position_check CHECK ((current_position IS NULL OR current_position >= 1) AND (previous_position IS NULL OR previous_position >= 1) AND (best_position IS NULL OR best_position >= 1))`,
            `ALTER TABLE seo_keywords ADD CONSTRAINT seo_keywords_metrics_check CHECK ((search_volume IS NULL OR search_volume >= 0) AND (difficulty IS NULL OR difficulty BETWEEN 0 AND 100))`,
            `ALTER TABLE seo_internal_links ADD CONSTRAINT seo_links_status_check CHECK (status IN ('suggested','approved','applied','rejected','removed'))`,
            `ALTER TABLE seo_redirects ADD CONSTRAINT seo_redirects_code_check CHECK (status_code IN (301,302,307,308,410))`,
            `ALTER TABLE seo_redirects ADD CONSTRAINT seo_redirects_hits_check CHECK (hit_count >= 0)`,
            `ALTER TABLE seo_integrations ADD CONSTRAINT seo_integrations_provider_check CHECK (provider IN ('google_search_console','bing_webmaster','indexnow','google_merchant','openai_searchbot','manual_import'))`,
            `ALTER TABLE seo_integrations ADD CONSTRAINT seo_integrations_status_check CHECK (status IN ('disconnected','configured','connected','error','disabled'))`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tenantTables = [
            "seo_entity_profiles",
            "seo_audit_runs",
            "seo_issues",
            "seo_keywords",
            "seo_competitors",
            "seo_internal_links",
            "seo_redirects",
            "seo_integrations",
            "seo_events",
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
            "seo_events",
            "seo_integrations",
            "seo_redirects",
            "seo_internal_links",
            "seo_competitors",
            "seo_keywords",
            "seo_issues",
            "seo_audit_runs",
            "seo_entity_profiles",
        ];
        for (const table of tables) this.schema.dropTable(table);
    }
}
