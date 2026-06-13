import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Names the platform operator behind an impersonated audited write. `admin_audit_log.actor_user_id`
 * points at a tenant `users` row — during impersonation that is the *target* shop admin, which
 * mis-attributes every action to the impersonated account with no operator trace.
 *
 * `impersonator_platform_user_id` carries the acting `platform_users` id (threaded from the
 * impersonation token's `impersonated_by:<id>` ability) so an audited edit made while impersonating
 * names BOTH the shop admin (actor) and the operator (impersonator). It cannot reuse the existing
 * `actor_user_id` FK (different id-space: `users` vs `platform_users`). SET NULL on operator removal
 * keeps the historical row intact. `admin_audit_log` is already a tenant-scoped RLS table; this
 * column is a plain nullable FK to the global `platform_users` and needs no RLS change.
 */
export default class extends BaseSchema {
    protected tableName = "admin_audit_log";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table
                .bigInteger("impersonator_platform_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("platform_users")
                .onDelete("SET NULL");
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("impersonator_platform_user_id");
        });
    }
}
