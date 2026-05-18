import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_line_items";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");

            /**
             * FKs are advisory — `SET NULL` so deleting/renaming a product or variation never
             * mutates a historical line. The `*_snapshot` columns below are the authoritative
             * receipt copy (ADR principle 4).
             */
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");

            table.string("name_snapshot", 255).notNullable();
            table.string("sku_snapshot", 120).nullable();
            table.integer("quantity").notNullable().defaultTo(1);

            /** Resolved at finalize time (sale price if active, else regular). Per-unit, gross. */
            table.bigInteger("price_snapshot").notNullable().defaultTo(0);

            /** Line subtotals + totals — same semantics as the cart-totals math but persisted. */
            table.bigInteger("subtotal").notNullable().defaultTo(0);
            table.bigInteger("subtotal_tax").notNullable().defaultTo(0);
            table.bigInteger("total").notNullable().defaultTo(0);
            table.bigInteger("total_tax").notNullable().defaultTo(0);

            table
                .bigInteger("tax_class_id_snapshot")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("tax_classes")
                .onDelete("SET NULL");

            table.jsonb("attributes_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_line_items_order_id_idx");
            table.index(["product_id"], "order_line_items_product_id_idx");
            table.index(["variation_id"], "order_line_items_variation_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_line_items_quantity_positive_check" CHECK (quantity >= 1)`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
