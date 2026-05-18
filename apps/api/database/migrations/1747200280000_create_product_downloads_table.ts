import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_downloads";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("restrict");
            table.integer("position").notNullable().defaultTo(0);
            table.integer("download_limit").nullable();
            table.integer("download_expiry_days").nullable();
            table.string("file_label", 200).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["product_id"], "product_downloads_product_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
