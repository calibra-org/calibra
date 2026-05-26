import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Explicit idempotency ledger for inbound PSP callbacks. Each row captures the audit trail
 * of one webhook event (provider, opaque event id, payload hash, what it ended up linking to).
 *
 * The `UNIQUE (provider, event_id)` constraint is the load-bearing invariant: every callback
 * handler INSERTs this row first inside the same transaction as the side-effect work. A
 * duplicate raises a unique-violation and the handler treats it as a replay — no state
 * mutation, no double-verification, no double-refund.
 *
 * The legacy "implicit" idempotency (gateway_authority + FOR UPDATE on payment_attempts) is
 * preserved as a second line of defence: even if a future PSP shares an event_id across two
 * different orders, the attempt-row lock still serialises the work. But this ledger is the
 * primary contract — it captures EVERY event that ever arrived, audit-readable.
 */
export default class extends BaseSchema {
    protected tableName = "processed_webhook_events";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("provider", 64).notNullable();
            table.string("event_id", 256).notNullable();
            table.string("event_kind", 64).notNullable();
            table
                .bigInteger("payment_attempt_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("payment_attempts")
                .onDelete("SET NULL");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.specificType("payload_hash", "char(64)").notNullable();
            table.string("outcome", 32).notNullable().defaultTo("processed");
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("processed_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["provider", "event_id"], { indexName: "processed_webhook_events_provider_event_id_unique" });
            table.index(["order_id"], "processed_webhook_events_order_id_index");
            table.index(["payment_attempt_id"], "processed_webhook_events_payment_attempt_id_index");
            table.index(["received_at"], "processed_webhook_events_received_at_index");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
