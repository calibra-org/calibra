import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_status_history";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("customer_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("customers")
                .onDelete("CASCADE");
            table.string("from_status", 16).nullable();
            table.string("to_status", 16).notNullable();
            table.text("reason").nullable();
            table
                .bigInteger("actor_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["customer_id", "occurred_at"], "customer_status_history_customer_id_occurred_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
