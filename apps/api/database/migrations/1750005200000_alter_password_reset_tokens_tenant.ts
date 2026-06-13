import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Tenant-scopes `password_reset_tokens` and adds operator-handoff provenance.
 *
 * The table was global (no `tenant_id`, no RLS): a reset token issued on shop A's host could be
 * consumed on shop B's host. With per-tenant identity this is both a correctness and an isolation
 * hole. This migration:
 *
 *  - adds `tenant_id` (backfilled from the owning user, then `NOT NULL` + FK + index),
 *  - adds `created_by_platform_user_id` (set only on operator-issued handoff links; SET NULL on
 *    operator removal so the audit trail survives),
 *  - adds `kind` (`self_service` for the storefront forgot-password flow, `operator_handoff` for the
 *    platform/admin "generate handoff link" action), and
 *  - enables `FORCE ROW LEVEL SECURITY` with the standard `tenant_isolation` policy.
 *
 * Backfill ordering (safe under existing data): `user_id` is FK `ON DELETE CASCADE`, so every row
 * references a live `users` row whose `tenant_id` is itself `NOT NULL` — the join backfill leaves no
 * NULLs, making the subsequent `SET NOT NULL` total. The storefront forgot-password controller runs
 * under tenant context, so once RLS is on it must stamp `tenant_id` via the model / `currentTrx()`
 * (handled in the controller change); operator-handoff rows are written on `postgres_admin` with an
 * explicit `tenant_id`.
 */
export default class extends BaseSchema {
    protected tableName = "password_reset_tokens";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.bigInteger("tenant_id").unsigned().nullable();
            table
                .bigInteger("created_by_platform_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("platform_users")
                .onDelete("SET NULL");
            table.string("kind", 16).notNullable().defaultTo("self_service");
        });

        /** Backfill tenant_id from the owning user before tightening to NOT NULL. */
        this.schema.raw(
            `UPDATE "${this.tableName}" prt ` +
                `SET "tenant_id" = u."tenant_id" ` +
                `FROM "users" u WHERE prt."user_id" = u."id"`,
        );

        this.schema.raw(`ALTER TABLE "${this.tableName}" ALTER COLUMN "tenant_id" SET NOT NULL`);
        /**
         * Match the GUC-default sweep (`1750003000000`): query-builder inserts riding a
         * GUC-bearing connection (and the test suite's session `app.current_tenant`) auto-fill
         * `tenant_id` without passing it explicitly. This table was created after that sweep, so it
         * needs the default applied here.
         */
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ALTER COLUMN "tenant_id" ` +
                `SET DEFAULT nullif(current_setting('app.current_tenant', true), '')::bigint`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "password_reset_tokens_tenant_id_foreign" ` +
                `FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
        );
        this.schema.raw(`CREATE INDEX "password_reset_tokens_tenant_id_idx" ON "${this.tableName}" ("tenant_id")`);
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "password_reset_tokens_kind_check" ` +
                `CHECK (kind IN ('self_service', 'operator_handoff'))`,
        );

        this.schema.raw(`ALTER TABLE "${this.tableName}" ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY "tenant_isolation" ON "${this.tableName}" ` +
                `USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint) ` +
                `WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint)`,
        );
    }

    async down() {
        this.schema.raw(`DROP POLICY IF EXISTS "tenant_isolation" ON "${this.tableName}"`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" NO FORCE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" DISABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT IF EXISTS "password_reset_tokens_kind_check"`);
        this.schema.raw(`DROP INDEX IF EXISTS "password_reset_tokens_tenant_id_idx"`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT IF EXISTS "password_reset_tokens_tenant_id_foreign"`);
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("tenant_id");
            table.dropColumn("created_by_platform_user_id");
            table.dropColumn("kind");
        });
    }
}
