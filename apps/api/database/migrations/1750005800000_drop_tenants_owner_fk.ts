import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Drop the `tenants.owner_user_id` → `users` foreign key (keep the column). The reference created a
 * dependency from the (intentionally never-truncated) reserved `tenants` row into `users`, which made
 * Postgres refuse the test suite's per-test `TRUNCATE "users"` ("cannot truncate a table referenced
 * in a foreign key constraint") — breaking every functional test's `beforeEach`.
 *
 * The "owner must be a real, live admin" invariant is upheld in application code (provisioning + the
 * make-owner endpoints validate the target; operators are soft-deleted and the owner can't be
 * removed/disabled), so a DB-level FK is not required. `owner_user_id` stays a plain `bigint`.
 */
export default class extends BaseSchema {
    protected tableName = "tenants";

    async up() {
        this.schema.raw(`
            DO $$
            DECLARE c text;
            BEGIN
                SELECT conname INTO c FROM pg_constraint
                WHERE conrelid = 'tenants'::regclass AND contype = 'f' AND conname LIKE '%owner_user_id%';
                IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE "tenants" DROP CONSTRAINT ' || quote_ident(c); END IF;
            END $$;
        `);
    }

    async down() {
        this.schema.raw(
            `ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_user_id_foreign" ` +
                `FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`,
        );
    }
}
