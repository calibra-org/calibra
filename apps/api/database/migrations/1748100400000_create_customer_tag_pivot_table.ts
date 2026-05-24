import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_tag_pivot";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.bigInteger("tag_id").unsigned().notNullable().references("id").inTable("customer_tags").onDelete("CASCADE");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["customer_id", "tag_id"], "customer_tag_pivot_pkey");
            table.index(["tag_id"], "customer_tag_pivot_tag_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
