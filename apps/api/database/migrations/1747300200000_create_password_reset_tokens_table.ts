import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "password_reset_tokens";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("user_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("users")
                .onDelete("CASCADE");
            /**
             * Store the SHA-256 hex digest of the issued token, never the plaintext. Verification
             * recomputes the digest from the submitted token before lookup so a database leak does
             * not let an attacker reset arbitrary passwords.
             */
            table.string("token_hash", 64).notNullable();
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("used_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["token_hash"], { indexName: "password_reset_tokens_token_hash_unique" });
            table.index(["user_id"], "password_reset_tokens_user_id_idx");
            table.index(["expires_at"], "password_reset_tokens_expires_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
