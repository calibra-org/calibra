import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "users";

    async up() {
        /**
         * `citext` enables case-insensitive email matching without `LOWER(email) = LOWER(?)` in
         * every login query. Created once per database — `IF NOT EXISTS` keeps the migration safe
         * on re-runs and on fresh test databases.
         */
        this.schema.raw("CREATE EXTENSION IF NOT EXISTS citext");

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.specificType("email", "citext").notNullable();
            table.string("password_hash", 255).notNullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("role", 16).notNullable().defaultTo("customer");
            table.timestamp("last_login_at", { useTz: true }).nullable();
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["email"], { indexName: "users_email_unique" });
            table.index(["role"], "users_role_idx");
            table.index(["deleted_at"], "users_deleted_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "users_role_check" CHECK (role IN ('customer', 'admin'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
