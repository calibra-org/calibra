import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_variations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.string("sku", 100).nullable();
            table.bigInteger("regular_price").nullable();
            table.bigInteger("sale_price").nullable();
            table.timestamp("sale_starts_at", { useTz: true }).nullable();
            table.timestamp("sale_ends_at", { useTz: true }).nullable();
            table.integer("weight_grams").nullable();
            table.integer("length_mm").nullable();
            table.integer("width_mm").nullable();
            table.integer("height_mm").nullable();
            table.bigInteger("image_media_id").unsigned().nullable().references("id").inTable("media").onDelete("set null");
            table.boolean("virtual").notNullable().defaultTo(false);
            table.boolean("downloadable").notNullable().defaultTo(false);
            table.bigInteger("tax_class_id").unsigned().nullable().references("id").inTable("tax_classes").onDelete("set null");
            table.string("manage_stock_mode", 16).notNullable().defaultTo("own");
            table.integer("menu_order").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["product_id"], "product_variations_product_id_idx");
            table.index(["deleted_at"], "product_variations_deleted_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "product_variations_manage_stock_mode_check" CHECK (manage_stock_mode IN ('own','parent'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_variations_sku_lower_unique" ON "${this.tableName}" (lower(sku)) WHERE sku IS NOT NULL AND deleted_at IS NULL`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "product_variations_sku_lower_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
