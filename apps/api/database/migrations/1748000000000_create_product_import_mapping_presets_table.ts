import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * `product_import_mapping_presets` — header-shape keyed mapping presets.
 *
 * Per spec point 12: presets are per-CSV-shape, not per-user. When an operator uploads a file
 * whose normalized-sorted-header fingerprint matches a previous import's, the wizard pre-applies
 * the saved mapping and shows an amber "applied previous mapping" banner. The user can override or
 * promote a one-off run to a named, persistent preset.
 *
 * `header_hash` is the 8-hex FNV-1a digest computed by `@calibra/shared/import-fields#hashHeaderSet`.
 * Mapping JSON is `{ csv_header: field_key | null }`.
 */
export default class extends BaseSchema {
    protected tableName = "product_import_mapping_presets";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("header_hash", 16).notNullable();
            table.string("name", 200).notNullable();
            table.jsonb("mapping").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("update_existing").notNullable().defaultTo(false);
            table
                .bigInteger("created_by_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.integer("use_count").notNullable().defaultTo(0);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["header_hash"], "product_import_presets_header_hash_idx");
            table.index(["last_used_at"], "product_import_presets_last_used_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
