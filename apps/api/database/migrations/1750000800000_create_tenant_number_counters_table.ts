import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Per-tenant monotonic counters that replace the global `order_number_seq` / `refund_number_seq`.
 * A Postgres sequence is database-global; multi-tenancy needs each shop's order numbers to restart
 * independently (tenant A and tenant B can both have order #1000). `kind` namespaces the counter
 * (`order`, `refund`); `next_value` is the next number to hand out. The numbering service advances
 * it under `@adonisjs/lock` + `SELECT … FOR UPDATE` to stay gap-free under concurrency.
 *
 * Per-tenant data → carries `tenant_id` and is RLS-guarded here (excluded from the bulk sweep).
 */
export default class extends BaseSchema {
    protected tableName = "tenant_number_counters";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table
                .bigInteger("tenant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("tenants")
                .onDelete("CASCADE");
            table.string("kind", 16).notNullable();
            table.bigInteger("next_value").notNullable().defaultTo(1000);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.primary(["tenant_id", "kind"]);
        });

        this.schema.raw(`ALTER TABLE "${this.tableName}" ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY "tenant_isolation" ON "${this.tableName}" ` +
                `USING (tenant_id = current_setting('app.current_tenant', true)::bigint) ` +
                `WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::bigint)`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
