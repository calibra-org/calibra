import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "products";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").primary();
            table.string("slug").notNullable().unique();
            table.string("name").notNullable();
            table.text("description").notNullable().defaultTo("");
            table.integer("price_cents").notNullable();
            table.string("currency", 3).notNullable().defaultTo("USD");
            table.integer("stock_quantity").nullable();
            table.string("image_url").nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
