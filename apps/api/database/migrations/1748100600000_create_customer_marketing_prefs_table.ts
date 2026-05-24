import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_marketing_prefs";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("customer_id")
                .unsigned()
                .notNullable()
                .primary("customer_marketing_prefs_pkey")
                .references("id")
                .inTable("customers")
                .onDelete("CASCADE");
            table.boolean("email_opt_in").notNullable().defaultTo(false);
            table.timestamp("email_opt_in_at", { useTz: true }).nullable();
            table.string("email_opt_in_source", 64).nullable();
            table.boolean("sms_opt_in").notNullable().defaultTo(false);
            table.timestamp("sms_opt_in_at", { useTz: true }).nullable();
            table.string("sms_opt_in_source", 64).nullable();
            table.boolean("phone_call_opt_in").notNullable().defaultTo(false);
            table.timestamp("phone_call_opt_in_at", { useTz: true }).nullable();
            table.string("phone_call_opt_in_source", 64).nullable();
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
