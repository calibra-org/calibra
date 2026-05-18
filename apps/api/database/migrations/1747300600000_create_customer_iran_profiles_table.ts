import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_iran_profiles";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            /**
             * Customer ID is also the primary key — this is a Pattern 3 extension table, strict 1:1
             * with the parent customer. Foreign customers have no row here; the absence is the
             * answer to "does this customer use Iranian fiscal identifiers?".
             */
            table
                .bigInteger("customer_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("customers")
                .onDelete("CASCADE")
                .primary();
            table.specificType("national_id", "char(10)").nullable();
            table.specificType("corporate_national_id", "char(11)").nullable();
            table.string("economic_code", 20).nullable();
            table.string("legal_company_name_fa", 200).nullable();
            table.string("vat_taxpayer_status", 20).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["national_id"], "customer_iran_profiles_national_id_idx");
            table.index(["corporate_national_id"], "customer_iran_profiles_corporate_national_id_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
