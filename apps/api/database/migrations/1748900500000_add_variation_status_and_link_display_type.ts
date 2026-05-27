import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds `status` to `product_variations` and `display_type` to `product_attribute_links`. Both
 * default to safe values so unmigrated rows keep working: every existing variation becomes
 * `status='active'` (still sellable) and every existing link becomes `display_type='dropdown'`
 * (no swatch metadata required).
 *
 * `status` powers the draft → active → inactive → archived lifecycle on the new Sellable
 * versions table. `display_type` is per-link customer-facing UX metadata for the Customer
 * choices card (dropdown / pills / color swatch / image swatch).
 */
export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("product_variations", (table) => {
            table
                .string("status", 16)
                .notNullable()
                .defaultTo("active")
                .checkIn(["draft", "active", "inactive", "archived"], "product_variations_status_chk");
            table.index(["product_id", "status"], "product_variations_product_id_status_idx");
        });
        this.schema.alterTable("product_attribute_links", (table) => {
            table
                .string("display_type", 20)
                .notNullable()
                .defaultTo("dropdown")
                .checkIn(["dropdown", "pills", "color_swatch", "image_swatch"], "product_attribute_links_display_type_chk");
        });
    }

    async down() {
        this.schema.alterTable("product_variations", (table) => {
            table.dropIndex(["product_id", "status"], "product_variations_product_id_status_idx");
            table.dropChecks(["product_variations_status_chk"]);
            table.dropColumn("status");
        });
        this.schema.alterTable("product_attribute_links", (table) => {
            table.dropChecks(["product_attribute_links_display_type_chk"]);
            table.dropColumn("display_type");
        });
    }
}
