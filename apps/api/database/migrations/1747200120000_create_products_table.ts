import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "products";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("type", 16).notNullable().defaultTo("simple");
            table.string("sku", 100).nullable();
            table.string("global_unique_id", 100).nullable();
            table.string("status", 16).notNullable().defaultTo("publish");
            table.string("catalog_visibility", 16).notNullable().defaultTo("visible");
            table.boolean("featured").notNullable().defaultTo(false);
            table.boolean("virtual").notNullable().defaultTo(false);
            table.boolean("downloadable").notNullable().defaultTo(false);
            table.bigInteger("regular_price").nullable();
            table.bigInteger("sale_price").nullable();
            table.timestamp("sale_starts_at", { useTz: true }).nullable();
            table.timestamp("sale_ends_at", { useTz: true }).nullable();
            table.bigInteger("tax_class_id").unsigned().nullable().references("id").inTable("tax_classes").onDelete("set null");
            table.string("tax_status", 16).notNullable().defaultTo("taxable");
            table
                .bigInteger("shipping_class_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_shipping_classes")
                .onDelete("set null");
            table.integer("weight_grams").nullable();
            table.integer("length_mm").nullable();
            table.integer("width_mm").nullable();
            table.integer("height_mm").nullable();
            table.boolean("sold_individually").notNullable().defaultTo(false);
            table.boolean("reviews_allowed").notNullable().defaultTo(true);
            table.string("external_url", 1024).nullable();
            table.integer("menu_order").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["status"], "products_status_idx");
            table.index(["type"], "products_type_idx");
            table.index(["featured"], "products_featured_idx");
            table.index(["menu_order"], "products_menu_order_idx");
            table.index(["deleted_at"], "products_deleted_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "products_type_check" CHECK (type IN ('simple','variable','grouped','external'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "products_status_check" CHECK (status IN ('draft','publish','private','pending'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "products_catalog_visibility_check" CHECK (catalog_visibility IN ('visible','catalog','search','hidden'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "products_tax_status_check" CHECK (tax_status IN ('taxable','shipping','none'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "products_sku_lower_unique" ON "${this.tableName}" (lower(sku)) WHERE sku IS NOT NULL AND deleted_at IS NULL`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "products_sku_lower_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
