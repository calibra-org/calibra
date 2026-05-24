import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * `product_export_filter_presets` — named per-user saved filter+column profiles for the
 * product exporter. Hydrates the form when selected; one preset can be flagged as the user's
 * default (auto-loaded on next visit).
 *
 * `filters`, `columns`, `format_options` are jsonb blobs — the wire shape matches the
 * `startExportValidator` payload so a preset can be passed straight to the runner without
 * shape conversion.
 */
export default class extends BaseSchema {
    protected tableName = "product_export_filter_presets";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("name", 200).notNullable();
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("columns").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("format_options").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("is_default").notNullable().defaultTo(false);
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["user_id", "name"], "product_export_presets_user_name_unique");
            table.index(["user_id", "is_default"], "product_export_presets_user_default_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
