import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_category_links";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table
                .bigInteger("category_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_categories")
                .onDelete("cascade");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["product_id", "category_id"]);
            table.index(["category_id"], "product_category_links_category_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
