import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * `product_exports` — one row per CSV product export request the operator kicks off. Owns the
 * full lifecycle (queued → running → completed | completed_with_errors | failed | cancelled),
 * the resolved file path under `storage/exports/`, the filters + columns + format options the
 * runner committed to, the row counters streamed via SSE, and the signed-download bookkeeping.
 *
 * Filters / columns / format_options are stored as jsonb so the history page can render an
 * exact replay of what the user picked (including filter chips for the "view filter" modal).
 *
 * `download_token_hash` + `download_expires_at` power the signed-URL download flow: the
 * controller's download endpoint accepts a token, hashes it the same way, compares
 * timing-safely, and refuses on mismatch / expiry. Storing only the hash means a leaked DB row
 * can't be used to download the file.
 */
export default class extends BaseSchema {
    protected tableName = "product_exports";

    async up() {
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE product_export_status_enum AS ENUM (
                    'queued', 'running', 'completed', 'completed_with_errors',
                    'failed', 'cancelled'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE product_export_scope_enum AS ENUM ('all', 'filter', 'selected', 'preset');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("RESTRICT");
            table.specificType("status", "product_export_status_enum").notNullable().defaultTo("queued");
            table.specificType("scope", "product_export_scope_enum").notNullable().defaultTo("filter");

            table
                .bigInteger("preset_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_export_filter_presets")
                .onDelete("SET NULL");

            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("columns").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("format_options").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.string("original_filename", 512).notNullable().defaultTo("");
            table.string("file_path", 1024).nullable();
            table.bigInteger("file_size_bytes").notNullable().defaultTo(0);
            table.boolean("compressed").notNullable().defaultTo(false);

            /** Signed-URL: HMAC-SHA256(user_id|export_id|expires_at, APP_KEY) hex. */
            table.string("download_token_hash", 128).nullable();
            table.timestamp("download_expires_at", { useTz: true }).nullable();

            table.integer("total_rows").notNullable().defaultTo(0);
            table.integer("processed_rows").notNullable().defaultTo(0);

            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("finished_at", { useTz: true }).nullable();
            table.timestamp("cancellation_requested_at", { useTz: true }).nullable();

            table.text("exception").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["user_id"], "product_exports_user_id_idx");
            table.index(["status"], "product_exports_status_idx");
            table.index(["created_at"], "product_exports_created_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
        this.schema.raw("DROP TYPE IF EXISTS product_export_status_enum");
        this.schema.raw("DROP TYPE IF EXISTS product_export_scope_enum");
    }
}
