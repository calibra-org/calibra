import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_variation_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("variation_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("cascade");
            table.string("locale", 8).notNullable();
            table.text("description").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["variation_id", "locale"]);
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
