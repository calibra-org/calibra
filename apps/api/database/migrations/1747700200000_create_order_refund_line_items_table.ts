import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_refund_line_items";

    /**
     * Line-level breakdown of a refund. Each row pins one `order_line_items` row to a
     * `(quantity, amount, tax)` tuple — partial-line refunds carry quantity > 0 and the matching
     * amount; full-line refunds carry the full line quantity. Tax is broken out so reporting can
     * roll it into the refund's tax_amount_minor without re-deriving rates.
     *
     * UNIQUE `(refund_id, order_line_item_id)` keeps a single refund from double-counting the same
     * source line. Multiple separate refunds on the same line are still allowed — they sit in
     * different `refund_id`s and the per-line outstanding is the source-line.quantity minus the
     * sum across every refund that touched it.
     */
    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();

            table.bigInteger("refund_id").unsigned().notNullable().references("id").inTable("order_refunds").onDelete("CASCADE");

            table
                .bigInteger("order_line_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("RESTRICT");

            table.integer("quantity").notNullable();

            table.bigInteger("refund_amount_minor").notNullable();
            table.bigInteger("refund_tax_minor").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["refund_id", "order_line_item_id"], { indexName: "order_refund_line_items_refund_line_unique" });
            table.index(["refund_id"], "order_refund_line_items_refund_id_idx");
            table.index(["order_line_item_id"], "order_refund_line_items_line_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_refund_line_items_quantity_positive_check" CHECK (quantity > 0)`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_refund_line_items_amount_nonneg_check" CHECK (refund_amount_minor >= 0)`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
