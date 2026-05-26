import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    /**
     * Allow `term_id` to be NULL on `product_variation_attributes` so a variation can pin
     * "Any term" for an attribute (e.g. "Any color, Size: S"). The cartesian generator emits
     * NULL as a distinct value alongside explicit terms.
     */
    async up() {
        this.schema.alterTable("product_variation_attributes", (table) => {
            table.bigInteger("term_id").unsigned().nullable().alter();
        });
    }

    async down() {
        this.schema.alterTable("product_variation_attributes", (table) => {
            table.bigInteger("term_id").unsigned().notNullable().alter();
        });
    }
}
