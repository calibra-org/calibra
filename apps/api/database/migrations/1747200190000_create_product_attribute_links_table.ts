import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_attribute_links";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table
                .bigInteger("attribute_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_attributes")
                .onDelete("restrict");
            table.integer("position").notNullable().defaultTo(0);
            table.boolean("visible").notNullable().defaultTo(true);
            table.boolean("used_for_variation").notNullable().defaultTo(false);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["product_id", "attribute_id"], { indexName: "product_attribute_links_product_attribute_unique" });
            table.index(["product_id"], "product_attribute_links_product_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
