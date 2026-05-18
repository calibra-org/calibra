import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_categories";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("parent_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_categories")
                .onDelete("set null");
            table.string("display", 32).notNullable().defaultTo("default");
            table.bigInteger("image_media_id").unsigned().nullable().references("id").inTable("media").onDelete("set null");
            table.integer("menu_order").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["parent_id"], "product_categories_parent_id_idx");
            table.index(["menu_order"], "product_categories_menu_order_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "product_categories_display_check" CHECK (display IN ('default','products','subcategories','both'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
