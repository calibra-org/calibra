import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_line_item_taxes";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("line_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("CASCADE");
            table.bigInteger("tax_rate_id").unsigned().nullable().references("id").inTable("tax_rates").onDelete("SET NULL");
            table.bigInteger("tax_amount").notNullable().defaultTo(0);
            table.bigInteger("shipping_tax_amount").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["line_item_id"], "order_line_item_taxes_line_item_id_idx");
            table.index(["tax_rate_id"], "order_line_item_taxes_tax_rate_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
