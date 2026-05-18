import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_cross_sells";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table
                .bigInteger("related_product_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("products")
                .onDelete("cascade");
            table.integer("position").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["product_id", "related_product_id"]);
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
