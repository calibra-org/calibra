import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_attribute_term_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("term_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attribute_terms")
                .onDelete("cascade");
            table.string("locale", 8).notNullable();
            table.string("name", 200).notNullable();
            table.string("slug", 240).notNullable();
            table.text("description").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["term_id", "locale"]);
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
