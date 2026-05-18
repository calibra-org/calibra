import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_brands";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("image_media_id").unsigned().nullable().references("id").inTable("media").onDelete("set null");
            table.integer("menu_order").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
