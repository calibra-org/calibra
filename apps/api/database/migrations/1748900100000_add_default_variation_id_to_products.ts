import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("products", (table) => {
            table
                .bigInteger("default_variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
        });
    }

    async down() {
        this.schema.alterTable("products", (table) => {
            table.dropColumn("default_variation_id");
        });
    }
}
