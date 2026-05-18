import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "coupon_product_constraints";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("coupon_id").unsigned().notNullable().references("id").inTable("coupons").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.string("mode", 16).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["coupon_id", "product_id", "mode"], { indexName: "coupon_product_constraints_unique" });
            table.index(["coupon_id"], "coupon_product_constraints_coupon_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "coupon_product_constraints_mode_check" CHECK (mode IN ('include','exclude'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
