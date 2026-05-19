import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "coupon_redemptions";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("coupon_id").unsigned().notNullable().references("id").inTable("coupons").onDelete("RESTRICT");
            /**
             * Bare BIGINT here because `orders` does not yet exist in the migration order at
             * this point. The cross-table FK to `orders.id` is added by a later migration once
             * the parent table is in place.
             */
            table.bigInteger("order_id").notNullable();
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("RESTRICT");
            /**
             * Email captured at submit so guest per-user limits are still enforceable when
             * `customer_id` is NULL. Same column also disambiguates two customers (logged-in +
             * guest) sharing an inbox.
             */
            table.string("email_snapshot", 320).notNullable();
            table.timestamp("redeemed_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            /**
             * One redemption per coupon per order — protects the idempotency-replay path: a second
             * `POST /checkout/submit` with the same `Idempotency-Key` cannot double-write.
             */
            table.unique(["coupon_id", "order_id"], { indexName: "coupon_redemptions_coupon_order_unique" });
            table.index(["coupon_id", "customer_id"], "coupon_redemptions_coupon_customer_idx");
            table.index(["coupon_id", "email_snapshot"], "coupon_redemptions_coupon_email_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
