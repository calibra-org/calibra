import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_refunds";

    /**
     * Refunds are stored in their own table (ADR D11) rather than as `orders` rows. The schema
     * mirrors WooCommerce's WC_Order_Refund surface (amount, reason, refunded-by user) but drops
     * the `wp_posts` coupling that forced Woo to encode refunds as posts in the first place.
     *
     * The actual `refund_number` BIGINT is allocated from the sibling `refund_number_seq`
     * (independent of `order_number_seq` so refund numbering doesn't share a sequence with
     * orders). The `gateway_refund_id` column is populated by phase 08 when the PSP returns its
     * own refund identifier — left null in this phase.
     */
    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();

            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");

            /**
             * Human-facing refund reference (parallel to `orders.order_number`). Sequence-allocated
             * so concurrent refund creation cannot collide on the value. UNIQUE so receipts/exports
             * key off it safely.
             */
            table.bigInteger("refund_number").notNullable().unique();

            /** Refunded amount in canonical money minor units (Rial). Always > 0. */
            table.bigInteger("amount_minor").notNullable();

            /** Tax portion of the refund (denormalized from per-line tax for fast roll-up). */
            table.bigInteger("tax_amount_minor").notNullable().defaultTo(0);

            table.text("reason").nullable();

            /** Admin who issued the refund. SET NULL on user deletion — audit row survives. */
            table.bigInteger("refunded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");

            table.boolean("restock_requested").notNullable().defaultTo(false);

            /**
             * PSP-side identifier returned by the gateway's `refund()` adapter call. Phase 08 wires
             * the adapter; this phase leaves the column NULL. Storing it lets ops reconcile a
             * Calibra refund against the gateway's portal directly.
             */
            table.string("gateway_refund_id", 100).nullable();

            /**
             * Idempotency-Key value the admin client sent on `POST .../refunds`. Partial UNIQUE
             * index (defined below) treats NULL as not-conflicting so admin-emitted refunds without
             * a key coexist. Replay-safe: the second request with the same key returns the original
             * refund row instead of double-issuing.
             */
            table.string("idempotency_key", 64).nullable();

            table.timestamp("processed_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "order_refunds_order_id_idx");
            table.index(["processed_at"], "order_refunds_processed_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_refunds_amount_positive_check" CHECK (amount_minor > 0)`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "order_refunds_tax_nonneg_check" CHECK (tax_amount_minor >= 0)`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_refunds_idempotency_key_unique" ON "${this.tableName}" (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "order_refunds_idempotency_key_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
