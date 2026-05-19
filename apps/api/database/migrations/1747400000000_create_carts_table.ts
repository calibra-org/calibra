import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "carts";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            /**
             * Opaque base32 lookup key, set as the `cart_token` cookie for anonymous shoppers. All
             * cart state lives in this row — the cookie is only the pointer.
             */
            table.specificType("token", "char(40)").notNullable().unique();
            /**
             * Nullable: anonymous carts have no customer. Becomes non-null after login (or
             * after the merge-on-login step folds the anon cart into the customer's existing cart).
             */
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("CASCADE");
            table.specificType("currency", "char(3)").notNullable().defaultTo("IRR");
            /**
             * Derived address fields used only for tax + shipping calc. They do NOT touch the
             * customer's saved address book — `POST /cart/customer` writes here.
             */
            table.specificType("country", "char(2)").nullable();
            table.bigInteger("region_id").unsigned().nullable().references("id").inTable("regions").onDelete("SET NULL");
            table.string("postcode", 20).nullable();
            table
                .bigInteger("shipping_zone_method_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("shipping_zone_methods")
                .onDelete("SET NULL");
            table.specificType("ip_address", "inet").nullable();
            table.text("user_agent").nullable();
            table.timestamp("last_activity_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("abandoned_at", { useTz: true }).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["customer_id"], "carts_customer_id_idx");
            table.index(["last_activity_at"], "carts_last_activity_at_idx");
        });

        /**
         * One active cart per logged-in customer. Anonymous carts (customer_id IS NULL) are
         * unconstrained — multiple guest carts may coexist across devices for the same shopper
         * until they log in (the cart_middleware merges them at that point).
         */
        this.schema.raw(
            `CREATE UNIQUE INDEX "carts_customer_id_unique" ON "${this.tableName}" (customer_id) WHERE customer_id IS NOT NULL`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "carts_customer_id_unique"`);
        this.schema.dropTable(this.tableName);
    }
}
