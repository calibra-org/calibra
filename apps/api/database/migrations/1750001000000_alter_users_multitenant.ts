import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Refactors `users` into the tenant-scoped identity table for both shoppers (`role=customer`) and
 * shop staff (`role=admin`). One account belongs to exactly one tenant. The global email-unique
 * constraint becomes per-tenant partial uniques so the same email/phone can exist independently in
 * different shops; `phone` is added for the SMS-OTP flow; a CHECK guarantees every row has at least
 * one contact handle. RLS itself is applied to `users` by the bulk sweep migration that follows.
 */
export default class extends BaseSchema {
    protected tableName = "users";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("phone", 32).nullable();
            table.dropUnique(["email"], "users_email_unique");
            table.index(["tenant_id"], "users_tenant_id_idx");
        });

        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "email" DROP NOT NULL`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "users_tenant_email_unique" ON "${this.tableName}" (tenant_id, email) WHERE email IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "users_tenant_phone_unique" ON "${this.tableName}" (tenant_id, phone) WHERE phone IS NOT NULL`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "users_contact_check" CHECK (email IS NOT NULL OR phone IS NOT NULL)`,
        );
    }

    async down() {
        this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT IF EXISTS "users_contact_check"`);
        this.schema.raw(`DROP INDEX IF EXISTS "users_tenant_phone_unique"`);
        this.schema.raw(`DROP INDEX IF EXISTS "users_tenant_email_unique"`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "email" SET NOT NULL`);

        this.schema.alterTable(this.tableName, (table) => {
            table.dropIndex(["tenant_id"], "users_tenant_id_idx");
            table.dropColumn("phone");
            table.dropColumn("tenant_id");
            table.unique(["email"], { indexName: "users_email_unique" });
        });
    }
}
