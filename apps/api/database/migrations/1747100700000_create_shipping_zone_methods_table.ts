import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "shipping_zone_methods";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("zone_id").unsigned().notNullable().references("id").inTable("shipping_zones").onDelete("restrict");
            table
                .bigInteger("method_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("shipping_methods")
                .onDelete("restrict");
            table.string("title_override", 200).nullable();
            table.boolean("enabled").notNullable().defaultTo(true);
            table.integer("ordering").notNullable().defaultTo(0);
            table.jsonb("settings").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["zone_id", "method_id"], { indexName: "shipping_zone_methods_zone_method_unique" });
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
