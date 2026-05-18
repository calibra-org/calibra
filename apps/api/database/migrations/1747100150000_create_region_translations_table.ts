import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "region_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("region_id").unsigned().notNullable().references("id").inTable("regions").onDelete("cascade");
            table.string("locale", 8).notNullable();
            table.string("name", 120).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["region_id", "locale"]);
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
