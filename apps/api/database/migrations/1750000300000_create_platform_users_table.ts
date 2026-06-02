import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Control-plane staff (the agency / platform operators). A global identity — these accounts are NOT
 * scoped to any tenant; they authenticate through a dedicated `platform` guard and can impersonate
 * shop staff. Email uniqueness is global here (unlike `users`, which is per-tenant).
 */
export default class extends BaseSchema {
    protected tableName = "platform_users";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.specificType("email", "citext").notNullable();
            table.string("password_hash", 255).notNullable();
            table.string("name").notNullable();
            table.string("role", 16).notNullable().defaultTo("staff");
            table.timestamp("last_login_at", { useTz: true }).nullable();
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["email"], { indexName: "platform_users_email_unique" });
            table.index(["deleted_at"], "platform_users_deleted_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "platform_users_role_check" CHECK (role IN ('owner', 'staff'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
