import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_tag_links";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.bigInteger("tag_id").unsigned().notNullable().references("id").inTable("product_tags").onDelete("cascade");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["product_id", "tag_id"]);
            table.index(["tag_id"], "product_tag_links_tag_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
