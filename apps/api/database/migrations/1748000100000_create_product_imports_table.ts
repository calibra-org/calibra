import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * `product_imports` — one row per CSV/XLSX import job kicked off by an admin.
 *
 * Owns the lifecycle (queued → running → completed | completed_with_errors | failed | cancelled |
 * rolled_back), the resolved file paths under `storage/imports/`, the mapping the operator chose,
 * the counters the wizard streams progress against, and the bookkeeping needed for undo + history.
 * Snapshots and error rows live in sibling tables / on disk so this row stays small enough to scan
 * cheaply for the history list.
 */
export default class extends BaseSchema {
    protected tableName = "product_imports";

    async up() {
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE product_import_status_enum AS ENUM (
                    'queued', 'validating', 'running', 'completed',
                    'completed_with_errors', 'failed', 'cancelled', 'rolled_back'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("user_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("users")
                .onDelete("RESTRICT");
            table.specificType("status", "product_import_status_enum").notNullable().defaultTo("queued");

            table.string("original_filename", 512).notNullable();
            table.string("file_path", 1024).notNullable();
            table.bigInteger("file_size_bytes").notNullable().defaultTo(0);
            table.string("header_hash", 16).notNullable();
            table.string("detected_delimiter", 4).notNullable().defaultTo(",");
            table.string("detected_encoding", 32).notNullable().defaultTo("utf-8");

            table.jsonb("mapping").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("update_existing").notNullable().defaultTo(false);

            table.integer("total_rows").notNullable().defaultTo(0);
            table.integer("processed_rows").notNullable().defaultTo(0);
            table.integer("created_count").notNullable().defaultTo(0);
            table.integer("updated_count").notNullable().defaultTo(0);
            table.integer("skipped_count").notNullable().defaultTo(0);
            table.integer("failed_count").notNullable().defaultTo(0);
            table.integer("new_categories_count").notNullable().defaultTo(0);
            table.integer("new_tags_count").notNullable().defaultTo(0);
            table.integer("queued_images_count").notNullable().defaultTo(0);

            table
                .bigInteger("preset_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_import_mapping_presets")
                .onDelete("SET NULL");

            /**
             * On-disk path of the JSON snapshot written before the run starts. Stores only the
             * fields each touched SKU is about to lose, so restore-from-snapshot is field-precise.
             * Pruned by the 24h cron alongside the upload.
             */
            table.string("snapshot_path", 1024).nullable();

            /** On-disk error report CSV (storage/imports/{id}-errors.csv). Built on completion. */
            table.string("error_report_path", 1024).nullable();

            table.timestamp("queued_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("finished_at", { useTz: true }).nullable();
            table.timestamp("cancellation_requested_at", { useTz: true }).nullable();
            table.timestamp("rolled_back_at", { useTz: true }).nullable();
            table
                .bigInteger("rolled_back_by_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");

            /** Stacktrace + message of the unhandled exception that aborted the run. */
            table.text("exception").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["user_id"], "product_imports_user_id_idx");
            table.index(["status"], "product_imports_status_idx");
            table.index(["created_at"], "product_imports_created_at_idx");
            table.index(["header_hash"], "product_imports_header_hash_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
        this.schema.raw("DROP TYPE IF EXISTS product_import_status_enum");
    }
}
