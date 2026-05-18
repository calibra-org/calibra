import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "coupon_email_restrictions";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("coupon_id").unsigned().notNullable().references("id").inTable("coupons").onDelete("CASCADE");
            /**
             * Pattern may be an exact `user@example.com` or a wildcard `*@example.com`. Matching
             * happens in the discounter (case-insensitive, glob style). Stored as plain TEXT —
             * matching is rare enough that a functional index would cost more than it saves.
             */
            table.string("email_pattern", 320).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["coupon_id", "email_pattern"], { indexName: "coupon_email_restrictions_unique" });
            table.index(["coupon_id"], "coupon_email_restrictions_coupon_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
