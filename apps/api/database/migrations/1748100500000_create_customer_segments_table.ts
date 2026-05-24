import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_segments";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("name", 80).notNullable();
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("is_pinned").notNullable().defaultTo(false);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("last_used_at", { useTz: true }).nullable();

            table.index(["user_id", "is_pinned"], "customer_segments_user_id_is_pinned_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
