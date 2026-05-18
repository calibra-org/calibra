import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "payment_gateways";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("code", 64).notNullable().unique();
            table.boolean("enabled").notNullable().defaultTo(false);
            table.integer("ordering").notNullable().defaultTo(0);
            table.jsonb("settings").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("supports").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
