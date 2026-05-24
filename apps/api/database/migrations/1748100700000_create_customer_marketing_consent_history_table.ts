import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_marketing_consent_history";

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
            table.string("channel", 16).notNullable();
            table.boolean("opted_in").notNullable();
            table.string("source", 64).nullable();
            table
                .bigInteger("actor_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(
                ["customer_id", "occurred_at"],
                "customer_marketing_consent_history_customer_id_occurred_at_idx",
            );
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "customer_marketing_consent_history_channel_check" CHECK (channel IN ('email', 'sms', 'phone'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
