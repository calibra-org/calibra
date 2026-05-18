import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_addresses";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            /** `billing` or `shipping`. Same row never plays both kinds; UNIQUE `(order_id, kind)`. */
            table.string("kind", 16).notNullable();
            table.string("first_name", 80).notNullable();
            table.string("last_name", 80).notNullable();
            table.string("company", 200).nullable();
            table.string("address_line_1", 255).notNullable();
            table.string("address_line_2", 255).nullable();
            table.string("city", 120).notNullable();
            /**
             * Region snapshot uses the country-agnostic FK from Pattern 1 with a `region_text`
             * fallback for unseeded countries. The FK is `SET NULL` so deleting a region row never
             * cascades into historical orders.
             */
            table.bigInteger("region_id").unsigned().nullable().references("id").inTable("regions").onDelete("SET NULL");
            table.text("region_text").nullable();
            table.string("postcode", 20).nullable();
            table.specificType("country", "char(2)").notNullable();
            table.string("phone", 32).nullable();
            table.string("email", 254).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_addresses_order_id_idx");
            table.index(["country"], "order_addresses_country_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_addresses_kind_check" CHECK (kind IN ('billing', 'shipping'))`,
        );
        /** One billing + one shipping per order, max. */
        this.schema.raw(`CREATE UNIQUE INDEX "order_addresses_order_kind_unique" ON "${this.tableName}" (order_id, kind)`);

        /**
         * Phase 03 created `order_address_iran_extensions` (Pattern 3) ahead of this table to keep
         * the iran-fields migration cohesive with the customer extensions. Add the FK now that the
         * parent table exists.
         */
        this.schema.raw(
            `ALTER TABLE "order_address_iran_extensions"
             ADD CONSTRAINT "order_address_iran_extensions_order_address_id_fkey"
             FOREIGN KEY (order_address_id) REFERENCES "${this.tableName}"(id) ON DELETE CASCADE`,
        );
    }

    async down() {
        this.schema.raw(
            `ALTER TABLE "order_address_iran_extensions" DROP CONSTRAINT IF EXISTS "order_address_iran_extensions_order_address_id_fkey"`,
        );
        this.schema.raw(`DROP INDEX IF EXISTS "order_addresses_order_kind_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
