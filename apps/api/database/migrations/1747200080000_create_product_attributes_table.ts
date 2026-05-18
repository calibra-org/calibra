import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_attributes";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("code", 100).notNullable().unique({ indexName: "product_attributes_code_unique" });
            table.string("order_by", 16).notNullable().defaultTo("menu_order");
            table.boolean("has_archives").notNullable().defaultTo(false);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "product_attributes_order_by_check" CHECK (order_by IN ('menu_order','name','id'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "product_attributes_code_no_pa_prefix" CHECK (code !~ '^pa_')`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
