import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customers";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            /**
             * `user_id` is nullable on purpose: guests get a customers row with no users row,
             * keeping the auth table free of PII. The `UNIQUE` clause guarantees the 1:1 link to
             * users when present without blocking multiple NULL guest rows.
             */
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("RESTRICT");
            table.string("first_name", 80).notNullable();
            table.string("last_name", 80).notNullable();
            table.string("phone", 32).nullable();
            table.specificType("country_default", "char(2)").notNullable().defaultTo("IR");
            table.boolean("is_paying_customer").notNullable().defaultTo(false);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["user_id"], { indexName: "customers_user_id_unique" });
            table.index(["phone"], "customers_phone_idx");
            table.index(["country_default"], "customers_country_default_idx");
            table.index(["deleted_at"], "customers_deleted_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
