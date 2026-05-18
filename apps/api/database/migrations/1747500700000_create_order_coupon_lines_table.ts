import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_coupon_lines";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            /**
             * Phase 06 lands `coupons` proper; the FK is added then. Storing the code snapshot lets
             * receipts render without the live coupon row.
             */
            table.bigInteger("coupon_id").unsigned().nullable();
            table.string("code_snapshot", 80).notNullable();
            table.bigInteger("discount").notNullable().defaultTo(0);
            table.bigInteger("discount_tax").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_coupon_lines_order_id_idx");
            table.index(["coupon_id"], "order_coupon_lines_coupon_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
