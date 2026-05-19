import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "cart_applied_coupons";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("cart_id").unsigned().notNullable().references("id").inTable("carts").onDelete("CASCADE");
            /**
             * Bare BIGINT here because `coupons` does not yet exist in the migration order. A
             * later migration adds the FK once the parent table is in place.
             */
            table.bigInteger("coupon_id").notNullable();
            table.string("code_snapshot", 200).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["cart_id", "coupon_id"], { indexName: "cart_applied_coupons_cart_coupon_unique" });
            table.index(["cart_id"], "cart_applied_coupons_cart_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
