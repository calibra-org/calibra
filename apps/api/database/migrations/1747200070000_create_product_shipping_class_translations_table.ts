import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_shipping_class_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("shipping_class_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_shipping_classes")
                .onDelete("cascade");
            table.string("locale", 8).notNullable();
            table.string("name", 200).notNullable();
            table.text("description").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["shipping_class_id", "locale"]);
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
