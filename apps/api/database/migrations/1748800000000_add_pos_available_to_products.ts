import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("products", (table) => {
            table.boolean("pos_available").notNullable().defaultTo(true);
        });
    }

    async down() {
        this.schema.alterTable("products", (table) => {
            table.dropColumn("pos_available");
        });
    }
}
