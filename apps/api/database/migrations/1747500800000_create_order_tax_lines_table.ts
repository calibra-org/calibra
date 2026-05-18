import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_tax_lines";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table
                .bigInteger("tax_rate_id_snapshot")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("tax_rates")
                .onDelete("SET NULL");
            table.string("rate_code_snapshot", 64).notNullable();
            table.string("label_snapshot", 200).notNullable();
            table.decimal("rate_percent_snapshot", 7, 4).notNullable();
            table.boolean("compound_snapshot").notNullable().defaultTo(false);
            table.bigInteger("tax_total").notNullable().defaultTo(0);
            table.bigInteger("shipping_tax_total").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_tax_lines_order_id_idx");
            table.index(["tax_rate_id_snapshot"], "order_tax_lines_tax_rate_id_snapshot_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
