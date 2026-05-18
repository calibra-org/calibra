import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_variation_attributes";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("variation_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("cascade");
            table
                .bigInteger("attribute_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attributes")
                .onDelete("restrict");
            table
                .bigInteger("term_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attribute_terms")
                .onDelete("restrict");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["variation_id", "attribute_id"]);
            table.index(["term_id"], "product_variation_attributes_term_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
