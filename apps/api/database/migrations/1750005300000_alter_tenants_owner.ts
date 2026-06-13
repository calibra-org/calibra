import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds the explicit shop-owner pointer to `tenants`. Provisioning computed the owner admin then
 * discarded the id; Control Plane v2 needs a durable `owner_user_id` to drive the `store_owner`
 * capability checks (who can transfer ownership, who can't be disabled/removed) and to default
 * impersonation to the owner.
 *
 * `ON DELETE RESTRICT`: a tenant must always have an owner, so the owner user cannot be hard-deleted
 * out from under the tenant (operator removal is a soft-delete + owner-guard, never a hard delete of
 * the owner). `tenants` is a global non-RLS table, so this cross-table FK to the RLS-scoped `users`
 * is safe (no policy interferes with the constraint check under the admin connection).
 *
 * Backfill ordering: every tenant is provisioned with exactly one owner admin, so backfilling the
 * lowest live admin id per tenant fills every row before the `SET NOT NULL`.
 */
export default class extends BaseSchema {
    protected tableName = "tenants";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table
                .bigInteger("owner_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("RESTRICT");
        });

        /** Backfill the lowest non-deleted admin id per tenant as the owner. */
        this.schema.raw(
            `UPDATE "${this.tableName}" t ` +
                `SET "owner_user_id" = sub.uid ` +
                `FROM (SELECT "tenant_id", MIN("id") AS uid FROM "users" ` +
                `WHERE "role" = 'admin' AND "deleted_at" IS NULL GROUP BY "tenant_id") sub ` +
                `WHERE t."id" = sub."tenant_id"`,
        );

        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "owner_user_id" SET NOT NULL`);
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("owner_user_id");
        });
    }
}
