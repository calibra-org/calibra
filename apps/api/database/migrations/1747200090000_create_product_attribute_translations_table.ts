import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_attribute_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("attribute_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attributes")
                .onDelete("cascade");
            table.string("locale", 8).notNullable();
            table.string("name", 200).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["attribute_id", "locale"]);
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
