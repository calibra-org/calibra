import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_documents";

    /**
     * Pattern 5 — the generic document table for proforma / invoice / packing-slip / credit-note
     * features that ship post-MVP. No controllers or renderers in this phase; just the schema, so
     * future work is purely additive (new enum value + renderer + endpoint) rather than a
     * migration on a hot table.
     */
    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("RESTRICT");
            /** No `.specificType(... )` with a CHECK — the enum itself constrains the values. */
            table.specificType("type", "order_document_type_enum").notNullable();
            /** Per-type sequence; allocated when the document is `issued`. NULL on drafts. */
            table.bigInteger("number").nullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.specificType("currency", "char(3)").notNullable().defaultTo("IRR");
            table.specificType("currency_display", "char(3)").notNullable().defaultTo("IRT");
            table.bigInteger("amount_minor").notNullable().defaultTo(0);
            table.string("status", 20).notNullable().defaultTo("draft");
            table.timestamp("issued_at", { useTz: true }).nullable();
            table.bigInteger("issued_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("pdf_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_documents_order_id_idx");
            table.index(["type"], "order_documents_type_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_documents_status_check" CHECK (status IN ('draft','issued','voided'))`,
        );
        /** Per-type, monotonic. NULLs (drafts) coexist; only issued documents take a slot. */
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_type_number_unique" ON "${this.tableName}" (type, number) WHERE number IS NOT NULL`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_type_number_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
