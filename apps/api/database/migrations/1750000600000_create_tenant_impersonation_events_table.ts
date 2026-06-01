import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Audit trail for platform staff "log in as" a tenant's shop admin. Global control-plane data — no
 * RLS (the platform must read its own audit log across every tenant), though `tenant_id` is carried
 * for filtering. `platform_user_id` is SET NULL on operator removal so the historical record
 * survives; `target_user_id` points at the impersonated `users` row.
 */
export default class extends BaseSchema {
    protected tableName = "tenant_impersonation_events";

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
            table
                .bigInteger("tenant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("tenants")
                .onDelete("CASCADE");
            table
                .bigInteger("target_user_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("users")
                .onDelete("CASCADE");
            table.string("reason").nullable();
            table.string("ip_address", 45).nullable();
            table.timestamp("started_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("ended_at", { useTz: true }).nullable();

            table.index(["tenant_id", "started_at"], "tenant_impersonation_events_tenant_id_idx");
            table.index(["platform_user_id"], "tenant_impersonation_events_platform_user_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
