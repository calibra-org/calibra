import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_addresses";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("customer_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("customers")
                .onDelete("CASCADE");
            table.string("kind", 16).notNullable();
            table.string("label", 80).nullable();
            table.string("first_name", 80).notNullable();
            table.string("last_name", 80).notNullable();
            table.string("company", 200).nullable();
            table.string("address_line_1", 255).notNullable();
            table.string("address_line_2", 255).nullable();
            table.string("city", 120).notNullable();
            /**
             * `region_id` is the country-agnostic FK to phase-01 `regions`. `region_text` is the
             * free-form fallback for countries we don't seed regions for. The CHECK constraint
             * requires at least one of (a) a region_id, (b) a region_text, or (c) a country
             * whose rules don't require a region — that last branch is validated in code via the
             * `country_address_rules` service, the constraint here only catches the obvious
             * "neither was provided" mistake.
             */
            table.bigInteger("region_id").unsigned().nullable().references("id").inTable("regions").onDelete("RESTRICT");
            table.text("region_text").nullable();
            table.string("postcode", 20).nullable();
            table.specificType("country", "char(2)").notNullable();
            table.string("phone", 32).nullable();
            table.boolean("is_default").notNullable().defaultTo(false);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["customer_id"], "customer_addresses_customer_id_idx");
            table.index(["country"], "customer_addresses_country_idx");
            table.index(["region_id"], "customer_addresses_region_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "customer_addresses_kind_check" CHECK (kind IN ('billing', 'shipping', 'both'))`,
        );

        /**
         * One default-per-(customer, kind). Partial unique index instead of a full unique because
         * multiple non-default rows of the same kind are allowed (the customer's address book).
         */
        this.schema.raw(
            `CREATE UNIQUE INDEX "customer_addresses_default_per_kind_unique" ON "${this.tableName}" (customer_id, kind) WHERE is_default IS TRUE`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
