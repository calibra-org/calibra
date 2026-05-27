import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds a `position` column to the `product_attribute_link_terms` pivot so the operator's
 * chosen order of values inside a single attribute (e.g. Color = red, blue, green) survives
 * a save + reload. Without this, PostgreSQL's row order is implementation-defined and any
 * drag-reorder in the admin silently reverted on next read.
 *
 * Existing rows seed `position` per `link_id` using `row_number()` over their current insert
 * order — best-effort but consistent. Index on `(link_id, position)` lets the load query
 * `ORDER BY` cheaply.
 */
export default class extends BaseSchema {
    protected tableName = "product_attribute_link_terms";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.integer("position").notNullable().defaultTo(0);
        });
        /**
         * Seed positions per `link_id` from current insert order. Without a stable order column
         * to rank by, fall back on `ctid` (PostgreSQL physical row pointer) — good enough for
         * the one-time backfill since the goal is "stop returning random order", not "match a
         * canonical historical sequence".
         */
        this.defer(async (db) => {
            await db.rawQuery(`
                WITH ranked AS (
                    SELECT ctid, link_id,
                           ROW_NUMBER() OVER (PARTITION BY link_id ORDER BY ctid) - 1 AS rn
                    FROM product_attribute_link_terms
                )
                UPDATE product_attribute_link_terms t
                SET position = r.rn
                FROM ranked r
                WHERE t.ctid = r.ctid;
            `);
        });
        this.schema.alterTable(this.tableName, (table) => {
            table.index(["link_id", "position"], "product_attribute_link_terms_link_position_idx");
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropIndex(["link_id", "position"], "product_attribute_link_terms_link_position_idx");
            table.dropColumn("position");
        });
    }
}
