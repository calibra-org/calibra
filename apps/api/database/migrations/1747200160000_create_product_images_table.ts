import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_images";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("restrict");
            table.integer("position").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["product_id", "position"], { indexName: "product_images_product_position_unique" });
            table.index(["product_id"], "product_images_product_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
