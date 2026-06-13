import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Ticketing core schema — the shared conversation model that powers BOTH the shop agent inbox
 * (`context = shop_customer`) and control-plane internal ticketing (`context = platform_internal`).
 * One set of tables, two contexts (see `ConversationContext`, R5). Mirrors Chatwoot's data model
 * (inbox / contact_inbox / conversation / message) mapped onto Calibra's RLS bridge.
 *
 * Every table carries `tenant_id NOT NULL` + `ENABLE` + `FORCE ROW LEVEL SECURITY` + the
 * NULL-safe `tenant_isolation` policy (R2). The policy + the column default are written in their
 * already-hardened (`NULLIF(…, '')`) form directly, because the sweep that hardened the legacy
 * tables (`1750004000000`) ran long before this migration — a fresh table must be born NULL-safe.
 *
 * Two columns are forward references resolved by later migrations (timestamps run in order):
 *  - `ticketing_inboxes.channel_connection_id` → `channel_connections` (added in `1750010300000`).
 *  - `ticketing_conversations.assignee_agent_id` → `ticketing_agents` (added in `1750010100000`).
 * They are plain nullable bigints here and gain their FK constraint once the target table exists.
 */
export default class extends BaseSchema {
    /**
     * Apply the per-tenant isolation contract to a freshly created table: a GUC-sourced default for
     * `tenant_id`, FORCE RLS, and the NULL-safe `tenant_isolation` policy. An unset/empty GUC
     * resolves to NULL → the `NOT NULL` column rejects the insert and the policy predicate is false,
     * so a context-less query sees ZERO rows (fail-closed), never another tenant's data.
     */
    private enableTenantRls(table: string) {
        this.schema.raw(
            `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
        );
        this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY "tenant_isolation" ON "${table}" ` +
                `USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint) ` +
                `WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint)`,
        );
    }

    async up() {
        /** Inbox = a routing surface bound to one channel type (internal or, phase-2, an external provider). */
        this.schema.createTable("ticketing_inboxes", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name").notNullable();
            table.string("channel_type", 24).notNullable();
            /** FK to channel_connections added in 1750010300000 (forward reference). */
            table.bigInteger("channel_connection_id").unsigned().nullable();
            table.string("assignment_strategy", 16).notNullable().defaultTo("manual");
            table.boolean("auto_assign").notNullable().defaultTo(false);
            table.jsonb("config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("is_default").notNullable().defaultTo(false);
            table.string("status", 16).notNullable().defaultTo("active");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id"], "ticketing_inboxes_tenant_id_idx");
        });
        this.schema.raw(
            `ALTER TABLE "ticketing_inboxes" ADD CONSTRAINT "ticketing_inboxes_channel_type_check" CHECK (channel_type IN ('internal_web', 'internal_platform', 'whatsapp', 'telegram'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_inboxes" ADD CONSTRAINT "ticketing_inboxes_assignment_strategy_check" CHECK (assignment_strategy IN ('manual', 'balanced'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_inboxes" ADD CONSTRAINT "ticketing_inboxes_status_check" CHECK (status IN ('active', 'disabled'))`,
        );
        /** At most one default inbox per (tenant, channel_type). */
        this.schema.raw(
            `CREATE UNIQUE INDEX "ticketing_inboxes_default_per_channel_unique" ON "ticketing_inboxes" ("tenant_id", "channel_type") WHERE is_default = true`,
        );
        this.enableTenantRls("ticketing_inboxes");

        /** Channel identity = Chatwoot contact_inbox: the (inbox, address) tuple that is a conversation's return path. */
        this.schema.createTable("ticketing_channel_identities", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("inbox_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_inboxes")
                .onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.specificType("channel_identity", "citext").notNullable();
            table.string("display_name").nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id"], "ticketing_channel_identities_tenant_id_idx");
            table.unique(["tenant_id", "inbox_id", "channel_identity"], {
                indexName: "ticketing_channel_identities_addr_unique",
            });
        });
        this.enableTenantRls("ticketing_channel_identities");

        /** Conversation = a thread on one inbox from one channel identity, in one of two contexts. */
        this.schema.createTable("ticketing_conversations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("display_id").notNullable();
            table
                .bigInteger("inbox_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_inboxes")
                .onDelete("CASCADE");
            table
                .bigInteger("channel_identity_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_channel_identities")
                .onDelete("CASCADE");
            table.string("context", 24).notNullable();
            table.string("subject").nullable();
            table.string("status", 16).notNullable().defaultTo("open");
            table.string("priority", 16).notNullable().defaultTo("normal");
            /** FK to ticketing_agents added in 1750010100000 (forward reference). */
            table.bigInteger("assignee_agent_id").unsigned().nullable();
            table.timestamp("last_activity_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("first_response_at", { useTz: true }).nullable();
            table.timestamp("snoozed_until", { useTz: true }).nullable();
            table.timestamp("waiting_since", { useTz: true }).nullable();
            /** Phase-2 WhatsApp 24h customer-care window; columns present, unused in v1. */
            table.timestamp("wa_last_inbound_at", { useTz: true }).nullable();
            table.timestamp("wa_window_expires_at", { useTz: true }).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.unique(["tenant_id", "display_id"], { indexName: "ticketing_conversations_display_id_unique" });
            table.index(["tenant_id", "status", "last_activity_at"], "ticketing_conversations_status_activity_idx");
            table.index(["tenant_id", "assignee_agent_id", "status"], "ticketing_conversations_assignee_idx");
            table.index(["tenant_id", "inbox_id"], "ticketing_conversations_inbox_idx");
        });
        this.schema.raw(
            `ALTER TABLE "ticketing_conversations" ADD CONSTRAINT "ticketing_conversations_context_check" CHECK (context IN ('shop_customer', 'platform_internal'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_conversations" ADD CONSTRAINT "ticketing_conversations_status_check" CHECK (status IN ('open', 'pending', 'snoozed', 'resolved', 'closed', 'archived'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_conversations" ADD CONSTRAINT "ticketing_conversations_priority_check" CHECK (priority IN ('low', 'normal', 'high', 'urgent'))`,
        );
        this.enableTenantRls("ticketing_conversations");

        /**
         * Message = one entry in a conversation feed (public reply, internal note, system activity,
         * or template). Single table in v1. PHASE-2 SCALE LEVER: monthly `RANGE(created_at)`
         * partitioning via pg_partman — every child partition MUST re-apply the `tenant_isolation`
         * policy + FORCE RLS, since RLS is not inherited by partitions.
         */
        this.schema.createTable("ticketing_messages", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("conversation_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_conversations")
                .onDelete("CASCADE");
            /** Denormalized from the conversation so RLS list scans stay index-only. */
            table
                .bigInteger("inbox_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_inboxes")
                .onDelete("CASCADE");
            table.string("direction", 16).notNullable();
            table.string("kind", 16).notNullable().defaultTo("message");
            table.string("content_type", 16).notNullable().defaultTo("text");
            table.text("body").nullable();
            table.jsonb("content_attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("author_kind", 16).notNullable();
            table.bigInteger("author_id").unsigned().nullable();
            table.boolean("private").notNullable().defaultTo(false);
            table.string("status", 16).notNullable().defaultTo("sent");
            table.specificType("provider_message_id", "citext").nullable();
            table.specificType("source_id", "citext").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id", "conversation_id", "created_at"], "ticketing_messages_conversation_idx");
        });
        this.schema.raw(
            `ALTER TABLE "ticketing_messages" ADD CONSTRAINT "ticketing_messages_direction_check" CHECK (direction IN ('inbound', 'outbound', 'internal'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_messages" ADD CONSTRAINT "ticketing_messages_kind_check" CHECK (kind IN ('message', 'note', 'activity', 'template'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_messages" ADD CONSTRAINT "ticketing_messages_content_type_check" CHECK (content_type IN ('text', 'image', 'file'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_messages" ADD CONSTRAINT "ticketing_messages_author_kind_check" CHECK (author_kind IN ('customer', 'user', 'platform_user', 'system'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_messages" ADD CONSTRAINT "ticketing_messages_status_check" CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed'))`,
        );
        this.enableTenantRls("ticketing_messages");

        /** Attachment = a media row (image/file in v1) bound to a message. */
        this.schema.createTable("ticketing_attachments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("message_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_messages")
                .onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id", "message_id"], "ticketing_attachments_message_idx");
        });
        this.enableTenantRls("ticketing_attachments");

        /** Participant = a requester/assignee/watcher on a conversation (any actor kind). */
        this.schema.createTable("ticketing_conversation_participants", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("conversation_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_conversations")
                .onDelete("CASCADE");
            table.string("participant_kind", 16).notNullable();
            table.bigInteger("participant_id").unsigned().notNullable();
            table.string("role", 16).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["tenant_id", "conversation_id", "participant_kind", "participant_id"], {
                indexName: "ticketing_conversation_participants_unique",
            });
        });
        this.schema.raw(
            `ALTER TABLE "ticketing_conversation_participants" ADD CONSTRAINT "ticketing_conversation_participants_kind_check" CHECK (participant_kind IN ('customer', 'user', 'platform_user'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_conversation_participants" ADD CONSTRAINT "ticketing_conversation_participants_role_check" CHECK (role IN ('requester', 'assignee', 'watcher'))`,
        );
        this.enableTenantRls("ticketing_conversation_participants");
    }

    async down() {
        this.schema.dropTableIfExists("ticketing_conversation_participants");
        this.schema.dropTableIfExists("ticketing_attachments");
        this.schema.dropTableIfExists("ticketing_messages");
        this.schema.dropTableIfExists("ticketing_conversations");
        this.schema.dropTableIfExists("ticketing_channel_identities");
        this.schema.dropTableIfExists("ticketing_inboxes");
    }
}
