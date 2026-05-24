import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_meta";

    /**
     * Flat key/value bag for per-order custom fields, mirroring WordPress's `postmeta` for orders.
     * Each `(order_id, key)` pair is unique so admins can iterate without dedup; values are stored
     * as TEXT (no enforced length beyond Postgres limits) since the surface accepts both short
     * scalar strings and JSON-serialized blobs.
     *
     * Keys prefixed with `_` follow the WP convention for "hidden" / system metadata and are
     * filtered out of the default admin list view unless `?show_hidden=1` is passed.
     */
    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();

            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");

            table.string("key", 191).notNullable();
            table.text("value").notNullable().defaultTo("");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["order_id", "key"], { indexName: "order_meta_order_key_uq" });
            table.index(["key"], "order_meta_key_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
