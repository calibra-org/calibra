import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Per-admin-user product favourites ("starred" products in the admin list). A pivot keyed on
 * `(user_id, product_id)` — each operator curates their own set, mirroring the per-browser
 * localStorage behaviour it replaces. Read via the `favorites=1` list filter + the `is_favorite`
 * flag on each AdminProduct row.
 */
export default class extends BaseSchema {
    protected tableName = "product_favorites";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("cascade");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["user_id", "product_id"]);
            table.index(["product_id"], "product_favorites_product_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
