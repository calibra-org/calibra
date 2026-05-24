import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_impersonation_events";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("impersonator_user_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("users")
                .onDelete("RESTRICT");
            table
                .bigInteger("customer_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("customers")
                .onDelete("CASCADE");
            table.timestamp("started_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("ended_at", { useTz: true }).nullable();
            table.string("ip_address", 45).nullable();
            table.text("user_agent").nullable();

            table.index(["customer_id", "started_at"], "customer_impersonation_events_customer_id_idx");
            table.index(["impersonator_user_id"], "customer_impersonation_events_impersonator_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
