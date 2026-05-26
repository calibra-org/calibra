import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("products", (table) => {
            table.string("gtin", 64).nullable();
        });
        this.schema.alterTable("product_variations", (table) => {
            table.string("gtin", 64).nullable();
        });
        this.schema.raw(`CREATE INDEX "products_gtin_idx" ON "products" (gtin) WHERE gtin IS NOT NULL`);
        this.schema.raw(`CREATE INDEX "product_variations_gtin_idx" ON "product_variations" (gtin) WHERE gtin IS NOT NULL`);
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "product_variations_gtin_idx"`);
        this.schema.raw(`DROP INDEX IF EXISTS "products_gtin_idx"`);
        this.schema.alterTable("product_variations", (table) => {
            table.dropColumn("gtin");
        });
        this.schema.alterTable("products", (table) => {
            table.dropColumn("gtin");
        });
    }
}
