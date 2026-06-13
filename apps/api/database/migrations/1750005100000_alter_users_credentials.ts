import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Operator credential lifecycle columns on the tenant-scoped `users` table:
 *
 *  - `must_change_password` — set on a generated/rotated/handed-off credential; the
 *    `password_change_required` middleware 423s an admin route until the operator clears it (the
 *    impersonation token bypasses the gate). Defaults `false` so every existing row is unaffected.
 *  - `disabled_at` — operator suspend (P3). A disabled operator's `oat_` sessions are revoked and any
 *    live impersonation of them lazy-closes on the next request.
 *
 * Both are nullable / defaulted, so no backfill is required. `last_login_at` already exists (drives
 * the "Never signed in" status), so it is not re-added here.
 */
export default class extends BaseSchema {
    protected tableName = "users";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.boolean("must_change_password").notNullable().defaultTo(false);
            table.timestamp("disabled_at", { useTz: true }).nullable();
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("must_change_password");
            table.dropColumn("disabled_at");
        });
    }
}
