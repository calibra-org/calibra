import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "inventory_movements";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("inventory_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("inventory_items")
                .onDelete("restrict");
            table.string("kind", 16).notNullable();
            table.integer("quantity_delta").notNullable();
            table.string("ref_kind", 16).nullable();
            table.bigInteger("ref_id").nullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.text("notes").nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["inventory_item_id"], "inventory_movements_inventory_item_id_idx");
            table.index(["ref_kind", "ref_id"], "inventory_movements_ref_idx");
            table.index(["kind"], "inventory_movements_kind_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "inventory_movements_kind_check" CHECK (kind IN ('sale','return','restock','adjustment','reservation','release'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "inventory_movements_ref_kind_check" CHECK (ref_kind IS NULL OR ref_kind IN ('order','refund','manual'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
