import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_translations";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.string("locale", 8).notNullable();
            table.string("name", 300).notNullable();
            table.string("slug", 320).notNullable();
            table.text("description").nullable();
            table.text("short_description").nullable();
            table.text("purchase_note").nullable();
            table.string("external_button_text", 120).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["product_id", "locale"]);
            table.unique(["locale", "slug"], { indexName: "product_translations_locale_slug_unique" });
            table.index(["name"], "product_translations_name_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
