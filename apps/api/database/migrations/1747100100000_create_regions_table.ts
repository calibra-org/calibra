import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "regions";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.specificType("country_code", "char(2)").notNullable();
            table.string("code", 10).notNullable();
            table.bigInteger("parent_id").unsigned().nullable().references("id").inTable("regions").onDelete("restrict");
            table.integer("ordering").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["country_code", "code"], { indexName: "regions_country_code_code_unique" });
            table.index(["country_code"], "regions_country_code_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
