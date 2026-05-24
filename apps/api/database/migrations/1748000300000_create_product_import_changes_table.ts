import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * `product_import_changes` — per-product diff log written as each row commits.
 *
 * Drives the import-history detail view ("why did saf-001's price change last Tuesday?" in two
 * clicks, per UX mandate #18) and is the audit trail the rollback feature replays against. One row
 * per (import, product, field) tuple — for a CSV that updates 13 products' regular_price you get 13
 * rows here, not 1 jsonb blob, because the page is filterable by SKU/field and joinable to the
 * products table.
 *
 * `op` distinguishes `create` (new product, old_value is NULL) from `update` (existing product,
 * both values populated). Rolled-back imports keep their change rows so the history list can still
 * show what *would have changed* even after restore.
 */
export default class extends BaseSchema {
    protected tableName = "product_import_changes";

    async up() {
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE product_import_change_op_enum AS ENUM ('create', 'update');
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
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.string("sku", 120).nullable();
            table.specificType("op", "product_import_change_op_enum").notNullable();
            table.string("field", 64).notNullable();
            table.text("old_value").nullable();
            table.text("new_value").nullable();
            table.integer("row_number").notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["import_id"], "product_import_changes_import_id_idx");
            table.index(["product_id"], "product_import_changes_product_id_idx");
            table.index(["sku"], "product_import_changes_sku_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
        this.schema.raw("DROP TYPE IF EXISTS product_import_change_op_enum");
    }
}
