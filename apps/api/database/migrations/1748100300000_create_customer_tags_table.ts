import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_tags";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("name", 40).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["name"], { indexName: "customer_tags_name_unique" });
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
