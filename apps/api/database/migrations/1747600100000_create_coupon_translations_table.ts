import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "coupon_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("coupon_id").unsigned().notNullable().references("id").inTable("coupons").onDelete("CASCADE");
            table.string("locale", 8).notNullable();
            table.text("description").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["coupon_id", "locale"], { constraintName: "coupon_translations_pkey" });
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
