import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Control-plane audit trail for platform-operator actions that an `admin_audit_log` row cannot hold
 * (its `actor_user_id` FK points at tenant `users`, never a `platform_users` actor). Every
 * provisioning / domain / operator / ownership mutation taken through `/api/v1/platform/*` writes a
 * row here, wrapped in the same `admin().transaction()` as the mutation it records.
 *
 * Global, non-RLS by design — the control-plane audit viewer reads across every tenant. `tenant_id`
 * is carried for filtering, not isolation. `platform_user_id` SET NULL on operator removal preserves
 * the record; `target_user_id` is the affected tenant `users` row (nullable for tenant-level actions
 * like provisioning that have no single user target).
 *
 * Append-only by convention (the runtime never UPDATE/DELETEs it; migrations are the trusted
 * exception). `calibra_app` DML access comes from the `ALTER DEFAULT PRIVILEGES … TO calibra_app`
 * grants installed by `db:bootstrap-roles` — no explicit GRANT needed here.
 */
export default class extends BaseSchema {
    protected tableName = "platform_audit_events";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("platform_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("platform_users")
                .onDelete("SET NULL");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("target_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("action", 48).notNullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("ip_address", 45).nullable();
            table.text("user_agent").nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id", "created_at"], "platform_audit_events_tenant_id_idx");
            table.index(["platform_user_id", "created_at"], "platform_audit_events_platform_user_id_idx");
            table.index(["action"], "platform_audit_events_action_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "platform_audit_events_action_check" CHECK (action IN (` +
                `'tenant_provisioned', 'tenant_updated', 'domain_added', 'domain_removed', ` +
                `'operator_created', 'operator_disabled', 'operator_enabled', 'operator_removed', ` +
                `'password_rotated', 'handoff_link_issued', 'ownership_transferred'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
