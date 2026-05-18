import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "payment_links";

    async up() {
        /**
         * Pattern 6 (extensibility) — schema-only landing for the future "send a payment link over
         * WhatsApp" feature. No endpoints in this phase; the schema exists now so the post-MVP
         * controller is a pure addition rather than a hot-table migration.
         */
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            /** Public slug — base32, ~40 bits entropy, opaque to URL guessing. */
            table.string("code", 32).notNullable().unique();
            /** `active | paid | expired | voided`. Plain string (no Postgres enum) — the set is small and value-stable. */
            table.string("status", 20).notNullable().defaultTo("active");

            /** NULL = customer picks the gateway on the pay page. */
            table
                .bigInteger("gateway_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("payment_gateways")
                .onDelete("SET NULL");

            table.bigInteger("amount_minor").notNullable();
            table.specificType("currency", "char(3)").notNullable();

            table.text("description").nullable();

            table.integer("max_uses").notNullable().defaultTo(1);
            table.integer("used_count").notNullable().defaultTo(0);

            table.timestamp("expires_at", { useTz: true }).nullable();

            /** Pre-bound to an existing order. NULL = standalone link, on pay creates one-line order. */
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");

            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["status"], "payment_links_status_idx");
            table.index(["order_id"], "payment_links_order_id_idx");
            table.index(["expires_at"], "payment_links_expires_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
