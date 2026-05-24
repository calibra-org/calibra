import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * `product_import_errors` — per-row failure log queried for the Step 4 error panel and the
 * editable retry table.
 *
 * Each row records the failing CSV row (1-indexed, header counted), the SKU it carried, the column
 * that triggered the failure (NULL for row-level errors like `duplicate_sku`), the machine-readable
 * code (mirrors `ERROR HANDLING` table in the spec), the localized message rendered at the time of
 * failure, the original value the operator pasted (so they can edit + retry), and the severity
 * (`error` blocks creation, `warning` is a skip-with-warning like `duplicate_sku`).
 *
 * `retried_at` + `retried_outcome` let the wizard mark an error row as resolved without deleting
 * it — the operator keeps the audit trail of what was originally wrong even after the retry.
 */
export default class extends BaseSchema {
    protected tableName = "product_import_errors";

    async up() {
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE product_import_error_severity_enum AS ENUM ('error', 'warning');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("import_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_imports")
                .onDelete("CASCADE");

            table.integer("row_number").notNullable();
            table.string("sku", 120).nullable();
            table.string("column_name", 200).nullable();
            table.string("code", 64).notNullable();
            table.text("message").notNullable();
            table.text("original_value").nullable();
            table.specificType("severity", "product_import_error_severity_enum").notNullable().defaultTo("error");

            table.timestamp("retried_at", { useTz: true }).nullable();
            table.string("retried_outcome", 32).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["import_id", "severity"], "product_import_errors_import_severity_idx");
            table.index(["import_id", "retried_at"], "product_import_errors_import_retried_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
        this.schema.raw("DROP TYPE IF EXISTS product_import_error_severity_enum");
    }
}
