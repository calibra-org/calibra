import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    /**
     * Allocates the human-facing refund numbers. Mirrors the `order_number_seq` pattern but lives
     * in its own sequence so refund numbering is independent of order numbering — refund #1001 is
     * not "the refund of order #1001"; they're parallel reference spaces.
     *
     * Allocation happens inside the `refund_service.create` transaction via
     * `SELECT nextval('refund_number_seq')`. Postgres serializes sequence advances at the engine
     * level, so concurrent refund issuance on the same order cannot collide on the value.
     */
    async up() {
        this.schema.raw(`CREATE SEQUENCE IF NOT EXISTS refund_number_seq START 1000`);
    }

    async down() {
        this.schema.raw(`DROP SEQUENCE IF EXISTS refund_number_seq`);
    }
}
