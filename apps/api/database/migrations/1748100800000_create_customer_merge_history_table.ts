import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_merge_history";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("primary_customer_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("customers")
                .onDelete("RESTRICT");
            table.bigInteger("merged_customer_id").unsigned().notNullable();
            table.jsonb("strategy").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table
                .bigInteger("actor_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["primary_customer_id"], "customer_merge_history_primary_idx");
            table.index(["merged_customer_id"], "customer_merge_history_merged_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
