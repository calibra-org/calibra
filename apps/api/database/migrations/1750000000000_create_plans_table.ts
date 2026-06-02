import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Control-plane catalog of subscription plans. Global reference data — no `tenant_id`, no RLS.
 * `db_tier` drives whether a tenant on this plan lives in the shared Postgres (bridge model) or is
 * eligible for promotion to a dedicated database; `limits` holds the soft quotas Phase 2/5 enforce.
 */
export default class extends BaseSchema {
    protected tableName = "plans";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("key", 48).notNullable();
            table.string("name").notNullable();
            table.string("db_tier", 16).notNullable().defaultTo("shared");
            table.jsonb("limits").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("is_default").notNullable().defaultTo(false);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["key"], { indexName: "plans_key_unique" });
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "plans_db_tier_check" CHECK (db_tier IN ('shared', 'dedicated'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
