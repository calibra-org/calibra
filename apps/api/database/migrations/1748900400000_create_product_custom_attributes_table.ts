import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_custom_attributes";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.integer("position").notNullable().defaultTo(0);
            table.string("name", 200).notNullable();
            table.jsonb("values").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.boolean("visible").notNullable().defaultTo(true);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["product_id", "position"], "product_custom_attributes_product_id_position_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
