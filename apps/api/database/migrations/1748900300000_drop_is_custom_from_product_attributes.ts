import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    /**
     * Reverts `1748900000000_add_is_custom_to_product_attributes`. The "custom attribute" concept
     * was dropped from the product detail UI — operators create attributes only through the
     * global `/products/attributes` admin page now, and there's no per-product distinction
     * between global and inline-created. One source of truth, simpler business logic.
     */
    async up() {
        this.schema.raw(`DROP INDEX IF EXISTS "product_attributes_is_custom_idx"`);
        this.schema.alterTable("product_attributes", (table) => {
            table.dropColumn("is_custom");
        });
    }

    async down() {
        this.schema.alterTable("product_attributes", (table) => {
            table.boolean("is_custom").notNullable().defaultTo(false);
        });
        this.schema.raw(`CREATE INDEX "product_attributes_is_custom_idx" ON "product_attributes" (is_custom)`);
    }
}
