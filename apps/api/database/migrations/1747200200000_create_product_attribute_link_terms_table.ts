import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_attribute_link_terms";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("link_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attribute_links")
                .onDelete("cascade");
            table
                .bigInteger("term_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attribute_terms")
                .onDelete("restrict");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["link_id", "term_id"]);
            table.index(["term_id"], "product_attribute_link_terms_term_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
