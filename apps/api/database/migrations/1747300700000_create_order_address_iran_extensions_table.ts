import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "order_address_iran_extensions";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            /**
             * IR fiscal-identifier snapshot extension for an `order_addresses` row. The FK to
             * `order_addresses` is added in the migration that creates that table — this file
             * only owns the schema. `order_address_id` doubles as the primary key, enforcing the
             * 1:1 contract.
             */
            table.bigInteger("order_address_id").unsigned().notNullable().primary();
            table.specificType("national_id", "char(10)").nullable();
            table.specificType("corporate_national_id", "char(11)").nullable();
            table.string("economic_code", 20).nullable();
            table.string("legal_company_name_fa", 200).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["national_id"], "order_address_iran_extensions_national_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
