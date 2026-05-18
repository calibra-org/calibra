import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "inventory_items";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("cascade");
            table.bigInteger("location_id").unsigned().nullable();
            table.integer("stock_quantity").notNullable().defaultTo(0);
            table.boolean("manage_stock").notNullable().defaultTo(true);
            table.string("backorders", 16).notNullable().defaultTo("no");
            table.integer("low_stock_threshold").nullable();
            table.string("stock_status", 16).notNullable().defaultTo("instock");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["product_id"], "inventory_items_product_id_idx");
            table.index(["variation_id"], "inventory_items_variation_id_idx");
            table.index(["stock_status"], "inventory_items_stock_status_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "inventory_items_backorders_check" CHECK (backorders IN ('no','notify','yes'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "inventory_items_stock_status_check" CHECK (stock_status IN ('instock','outofstock','onbackorder'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "inventory_items_product_variation_location_unique"
             ON "${this.tableName}" (product_id, COALESCE(variation_id, 0), COALESCE(location_id, 0))`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "inventory_items_product_variation_location_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
