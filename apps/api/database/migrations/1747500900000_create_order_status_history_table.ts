import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_status_history";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            /**
             * NULL on the first row (`draft` initial-state has no prior status). Otherwise the
             * state-machine writes both columns from its `transition(order, to, …)` call.
             */
            table.specificType("from_status", "order_status_enum").nullable();
            table.specificType("to_status", "order_status_enum").notNullable();
            table.bigInteger("changed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("reason").nullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_status_history_order_id_idx");
            table.index(["to_status"], "order_status_history_to_status_idx");
            table.index(["occurred_at"], "order_status_history_occurred_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
