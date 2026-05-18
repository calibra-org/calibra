import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "orders";

    async up() {
        /**
         * Read-side helper so admin/storefront screens can fetch "the latest payment attempt for
         * this order" in a single FK hop instead of an `ORDER BY initiated_at DESC LIMIT 1`
         * subquery. SET NULL on delete keeps the order viewable if an attempt row is purged.
         */
        this.schema.alterTable(this.tableName, (table) => {
            table
                .bigInteger("last_payment_attempt_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("payment_attempts")
                .onDelete("SET NULL");
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("last_payment_attempt_id");
        });
    }
}
