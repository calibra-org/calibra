import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Relax `tenants.owner_user_id` back to NULL-able. Provisioning has a circular dependency: the owner
 * `users` row needs the tenant's id (FK + RLS), so the tenant must be INSERTed first — at which point
 * there is no owner id yet. A `NOT NULL` column makes that first insert fail. The owner is stamped
 * immediately afterward inside the same provisioning transaction, so the "every tenant has an owner"
 * invariant is upheld by application logic (provisioning + the make-owner endpoints) rather than the
 * column constraint. The FK (`ON DELETE RESTRICT`) is kept — an owner still can't be hard-deleted.
 */
export default class extends BaseSchema {
    protected tableName = "tenants";

    async up() {
        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "owner_user_id" DROP NOT NULL`);
    }

    async down() {
        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "owner_user_id" SET NOT NULL`);
    }
}
