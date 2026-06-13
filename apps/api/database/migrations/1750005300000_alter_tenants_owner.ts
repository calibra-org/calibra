import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds the shop-owner pointer to `tenants` — a plain, nullable `bigint` (NOT a foreign key).
 *
 * Deliberately FK-less + nullable, for two structural reasons:
 *  - **Provisioning insert order.** The owner `users` row needs the tenant id (FK + RLS), so the
 *    tenant is inserted first and the owner stamped immediately after in the same transaction; a
 *    `NOT NULL` column would make that first insert fail.
 *  - **Test-suite truncation.** The reserved test tenant is never truncated, so a real FK from
 *    `tenants` into `users` would make Postgres refuse the per-test `TRUNCATE "users"`.
 *
 * The "owner is a real, live admin" invariant is upheld in application code (provisioning + the
 * make-owner endpoints validate the target; operators are soft-deleted and the owner can't be
 * removed/disabled). Existing tenants are backfilled to their lowest non-deleted admin.
 */
export default class extends BaseSchema {
    protected tableName = "tenants";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.bigInteger("owner_user_id").unsigned().nullable();
            table.index(["owner_user_id"], "tenants_owner_user_id_idx");
        });

        /** Backfill the lowest non-deleted admin id per tenant as the owner. */
        this.schema.raw(
            `UPDATE "${this.tableName}" t ` +
                `SET "owner_user_id" = sub.uid ` +
                `FROM (SELECT "tenant_id", MIN("id") AS uid FROM "users" ` +
                `WHERE "role" = 'admin' AND "deleted_at" IS NULL GROUP BY "tenant_id") sub ` +
                `WHERE t."id" = sub."tenant_id"`,
        );
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropIndex(["owner_user_id"], "tenants_owner_user_id_idx");
            table.dropColumn("owner_user_id");
        });
    }
}
