import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_brand_links";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.bigInteger("brand_id").unsigned().notNullable().references("id").inTable("product_brands").onDelete("cascade");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["product_id", "brand_id"]);
            table.index(["brand_id"], "product_brand_links_brand_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
