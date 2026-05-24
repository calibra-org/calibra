import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "admin_audit_log";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("actor_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.string("action", 64).notNullable();
            table.string("entity_kind", 32).notNullable();
            table.bigInteger("entity_id").nullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("ip_address", 45).nullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["entity_kind", "entity_id", "occurred_at"], "admin_audit_log_entity_idx");
            table.index(["actor_user_id", "occurred_at"], "admin_audit_log_actor_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
