import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Opaque bearer tokens for the `platform` guard, mirroring `auth_access_tokens` but tokenable on
 * `platform_users`. Kept in a separate table so the control-plane guard and the per-tenant guard
 * never share a token namespace. Minted with the `pat_` prefix.
 */
export default class extends BaseSchema {
    protected tableName = "platform_access_tokens";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("tokenable_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("platform_users")
                .onDelete("CASCADE");

            table.string("type", 64).notNullable();
            table.string("name", 200).nullable();
            table.string("hash", 255).notNullable();
            table.text("abilities").notNullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.timestamp("expires_at", { useTz: true }).nullable();

            table.index(["tokenable_id"], "platform_access_tokens_tokenable_id_idx");
            table.index(["hash"], "platform_access_tokens_hash_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
