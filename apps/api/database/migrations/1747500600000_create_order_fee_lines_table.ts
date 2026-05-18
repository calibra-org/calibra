import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_fee_lines";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.string("name_snapshot", 200).notNullable();
            table
                .bigInteger("tax_class_id_snapshot")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("tax_classes")
                .onDelete("SET NULL");
            table.boolean("taxable").notNullable().defaultTo(true);
            table.bigInteger("total").notNullable().defaultTo(0);
            table.bigInteger("total_tax").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_fee_lines_order_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
