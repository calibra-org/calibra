import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("product_attributes", (table) => {
            table.boolean("is_custom").notNullable().defaultTo(false);
        });
        this.schema.raw(`CREATE INDEX "product_attributes_is_custom_idx" ON "product_attributes" (is_custom)`);
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "product_attributes_is_custom_idx"`);
        this.schema.alterTable("product_attributes", (table) => {
            table.dropColumn("is_custom");
        });
    }
}
