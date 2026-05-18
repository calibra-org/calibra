import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_attribute_terms";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("attribute_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attributes")
                .onDelete("cascade");
            table.integer("menu_order").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["attribute_id"], "product_attribute_terms_attribute_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
