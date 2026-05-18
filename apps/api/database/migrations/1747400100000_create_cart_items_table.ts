import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "cart_items";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("cart_id").unsigned().notNullable().references("id").inTable("carts").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("RESTRICT");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("RESTRICT");
            table.integer("quantity").notNullable().defaultTo(1);
            /**
             * Resolved at add-time (sale price if currently on sale, else regular). Re-resolved
             * when the line is added a second time; we don't re-price existing lines silently.
             */
            table.bigInteger("price_snapshot").notNullable();
            table.jsonb("attributes_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["cart_id"], "cart_items_cart_id_idx");
            table.index(["product_id"], "cart_items_product_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "cart_items_quantity_positive_check" CHECK (quantity >= 1)`,
        );
        /**
         * Two concurrent adds of the same (product, variation) must not produce two rows. The
         * controller funnels both through an UPSERT keyed on this index so the second request
         * increments quantity instead of inserting a duplicate.
         */
        this.schema.raw(
            `CREATE UNIQUE INDEX "cart_items_cart_product_variation_unique"
             ON "${this.tableName}" (cart_id, product_id, COALESCE(variation_id, 0))`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "cart_items_cart_product_variation_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
