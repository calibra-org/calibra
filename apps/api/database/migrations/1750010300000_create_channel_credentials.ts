import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * External-channel credential store + the tenant-scoped inbound dedup ledger.
 *
 * `channel_connections` holds one external provider binding per tenant; `endpoint_id` is the opaque,
 * GLOBALLY-unique random id embedded in the inbound webhook URL
 * (`/api/v1/webhooks/channels/:provider/:endpointId`). It is the only safe way to resolve the tenant
 * for a server-to-server POST that carries no Host and no browser context (R3) — never the tenant
 * slug. The secret itself lives sealed in `channel_secrets` (ChaCha20-Poly1305 AEAD via the
 * encryption service, R0); plaintext is NEVER stored and NEVER returned.
 *
 * `ticketing_inbound_events` is a NEW tenant-scoped dedup ledger — deliberately NOT the PSP
 * `processed_webhook_events`, whose `UNIQUE(provider, event_id)` (even after the RLS sweep added
 * `tenant_id`) is payment-attempt/order coupled and whose semantics belong to PSP callbacks (R3,
 * §0). The `UNIQUE(tenant_id, provider, external_event_id)` here lets two tenants legitimately carry
 * the same provider-side event id without colliding.
 *
 * Also resolves the forward reference from `1750010000000`:
 * `ticketing_inboxes.channel_connection_id` gains its FK now that `channel_connections` exists.
 */
export default class extends BaseSchema {
    /**
     * Apply the per-tenant isolation contract (GUC default + FORCE RLS + NULL-safe policy) to a
     * freshly created table. See `1750010000000` for the rationale.
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
        this.schema.createTable("channel_connections", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider", 16).notNullable();
            table.string("provider_variant", 32).nullable();
            /** Opaque, globally-unique webhook routing id. Resolved on the admin connection (R3). */
            table.specificType("endpoint_id", "citext").notNullable();
            table.string("status", 16).notNullable().defaultTo("pending");
            table.jsonb("public_config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("key_version").notNullable().defaultTo(1);
            table.timestamp("last_verified_at", { useTz: true }).nullable();
            table.text("last_error").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id"], "channel_connections_tenant_id_idx");
            table.unique(["endpoint_id"], { indexName: "channel_connections_endpoint_id_unique" });
        });
        this.schema.raw(
            `ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_provider_check" CHECK (provider IN ('whatsapp', 'telegram'))`,
        );
        this.schema.raw(
            `ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_status_check" CHECK (status IN ('pending', 'connected', 'error'))`,
        );
        this.enableTenantRls("channel_connections");

        this.schema.createTable("channel_secrets", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("connection_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("channel_connections")
                .onDelete("CASCADE");
            /** AEAD ciphertext from the encryption service — opaque, never decrypted to the client. */
            table.text("ciphertext").notNullable();
            table.integer("key_version").notNullable().defaultTo(1);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id", "connection_id"], "channel_secrets_connection_idx");
        });
        this.enableTenantRls("channel_secrets");

        this.schema.createTable("ticketing_inbound_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider", 16).notNullable();
            table.specificType("external_event_id", "citext").notNullable();
            table
                .bigInteger("conversation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("ticketing_conversations")
                .onDelete("SET NULL");
            table.string("outcome", 32).notNullable().defaultTo("received");
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("processed_at", { useTz: true }).nullable();

            table.unique(["tenant_id", "provider", "external_event_id"], {
                indexName: "ticketing_inbound_events_dedup_unique",
            });
        });
        this.enableTenantRls("ticketing_inbound_events");

        /** Resolve the forward reference declared in 1750010000000. */
        this.schema.raw(
            `ALTER TABLE "ticketing_inboxes" ADD CONSTRAINT "ticketing_inboxes_channel_connection_id_foreign" ` +
                `FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections" ("id") ON DELETE SET NULL`,
        );
    }

    async down() {
        this.schema.raw(
            `ALTER TABLE "ticketing_inboxes" DROP CONSTRAINT IF EXISTS "ticketing_inboxes_channel_connection_id_foreign"`,
        );
        this.schema.dropTableIfExists("ticketing_inbound_events");
        this.schema.dropTableIfExists("channel_secrets");
        this.schema.dropTableIfExists("channel_connections");
    }
}
