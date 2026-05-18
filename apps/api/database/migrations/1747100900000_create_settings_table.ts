import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "settings";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.string("group_key", 64).notNullable();
            table.string("key", 120).notNullable();
            table.jsonb("value").notNullable();
            table.specificType("type", "char(16)").notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["group_key", "key"]);
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "settings_type_check" CHECK (rtrim(type) IN ('string', 'number', 'boolean', 'json'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
