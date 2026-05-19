import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_notes";

    /**
     * Flat notes table, same shape WooCommerce uses for `wc_order_notes`. `visibility = 'internal'` rows never leave the
     * admin surface; `visibility = 'customer'` rows are exposed through the storefront's account
     * timeline AND can opt-in to email delivery at the controller layer (no column needed for the
     * email choice — it's a one-shot side effect, not state).
     *
     * `author_user_id` is NULL on system-emitted notes (e.g. the refund_service's audit row, or a
     * future status-change auto-comment) so those rows are clearly distinguishable from admin
     * actions for compliance review.
     */
    async up() {
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE order_note_visibility_enum AS ENUM ('internal', 'customer');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();

            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");

            table.text("body").notNullable();

            table.specificType("visibility", "order_note_visibility_enum").notNullable().defaultTo("internal");

            /** NULL = system-emitted (refund audit row, status-change auto-comment, …). */
            table.bigInteger("author_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");

            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_notes_order_id_idx");
            table.index(["order_id", "visibility"], "order_notes_order_visibility_idx");
            table.index(["created_at"], "order_notes_created_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
        this.schema.raw(`DROP TYPE IF EXISTS order_note_visibility_enum`);
    }
}
