import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "auth_access_tokens";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("tokenable_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("users")
                .onDelete("CASCADE");

            table.string("type", 64).notNullable();
            table.string("name", 200).nullable();
            table.string("hash", 255).notNullable();
            table.text("abilities").notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.timestamp("expires_at", { useTz: true }).nullable();

            table.index(["tokenable_id"], "auth_access_tokens_tokenable_id_idx");
            table.index(["hash"], "auth_access_tokens_hash_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
