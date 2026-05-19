import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    /**
     * Allocates the human-facing order numbers. Independent of `orders.id` so id stays
     * opaque while the number stays compact and gap-free for customer support. `START 1000` keeps
     * the very first order's number from looking like a test artifact ("#1") — operators see
     * realistic-looking references from day one.
     *
     * Allocation is via `SELECT nextval('order_number_seq')` inside the finalize transaction;
     * Postgres serializes sequence advances at the engine level so concurrent submits cannot
     * collide on the value.
     */
    async up() {
        this.schema.raw(`CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000`);
    }

    async down() {
        this.schema.raw(`DROP SEQUENCE IF EXISTS order_number_seq`);
    }
}
