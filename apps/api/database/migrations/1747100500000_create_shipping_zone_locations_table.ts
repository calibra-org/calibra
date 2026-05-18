import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "shipping_zone_locations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("zone_id").unsigned().notNullable().references("id").inTable("shipping_zones").onDelete("restrict");
            table.string("type", 16).notNullable();
            table.string("code", 64).notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["zone_id"], "shipping_zone_locations_zone_id_idx");
            table.index(["type", "code"], "shipping_zone_locations_type_code_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "shipping_zone_locations_type_check" CHECK (type IN ('continent', 'country', 'state', 'postcode'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
