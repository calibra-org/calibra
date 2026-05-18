import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_shipping_lines";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");

            /**
             * Snapshots of the picked shipping method. The FKs are advisory because deleting a
             * zone/method must not corrupt historical orders.
             */
            table
                .bigInteger("method_id_snapshot")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("shipping_methods")
                .onDelete("SET NULL");
            table
                .bigInteger("instance_id_snapshot")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("shipping_zone_methods")
                .onDelete("SET NULL");
            table.string("method_code_snapshot", 64).notNullable();
            table.string("title_snapshot", 200).notNullable();

            table.bigInteger("total").notNullable().defaultTo(0);
            table.bigInteger("total_tax").notNullable().defaultTo(0);

            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_shipping_lines_order_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
