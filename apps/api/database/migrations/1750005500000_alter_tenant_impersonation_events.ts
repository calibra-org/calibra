import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Enriches the impersonation event record so a session can be attributed, closed precisely, and
 * audited with intent:
 *
 *  - `user_agent` — captured at mint time (the request UA of the operator).
 *  - `end_cause` — how the session ended (`manual` exit, token `expired`, operator/logout `revoked`).
 *    Nullable while a session is open; the CHECK allows NULL.
 *  - `reason` becomes `NOT NULL` — Control Plane v2 requires an operator reason on every "log in as".
 *    Pre-existing rows with a NULL reason are backfilled to `'legacy'` before the constraint tightens.
 *
 * Global non-RLS control-plane table (the platform reads its own audit across every tenant) — no RLS
 * changes.
 */
export default class extends BaseSchema {
    protected tableName = "tenant_impersonation_events";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.text("user_agent").nullable();
            table.string("end_cause", 16).nullable();
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenant_impersonation_events_end_cause_check" ` +
                `CHECK (end_cause IS NULL OR end_cause IN ('manual', 'expired', 'revoked'))`,
        );

        /** Backfill legacy NULL reasons before requiring the column. */
        this.schema.raw(`UPDATE "${this.tableName}" SET "reason" = 'legacy' WHERE "reason" IS NULL`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "reason" SET NOT NULL`);
    }

    async down() {
        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "reason" DROP NOT NULL`);
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" DROP CONSTRAINT IF EXISTS "tenant_impersonation_events_end_cause_check"`,
        );
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("user_agent");
            table.dropColumn("end_cause");
        });
    }
}
