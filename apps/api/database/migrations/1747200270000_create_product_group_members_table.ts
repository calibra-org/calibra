import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_group_members";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("group_product_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("products")
                .onDelete("cascade");
            table
                .bigInteger("member_product_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("products")
                .onDelete("cascade");
            table.integer("position").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["group_product_id", "member_product_id"]);
            table.index(["group_product_id", "position"], "product_group_members_group_position_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
