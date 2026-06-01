import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Per-tenant daily usage rollup powering plan-limit enforcement and billing (Phase 2/5 fill it;
 * created now so the seam exists). Global control-plane data — `tenant_id` is present for filtering
 * and FK integrity, but there is NO RLS: the platform reads across all tenants to bill and alert.
 * Values are `bigint` (orders count, revenue in minor units, storage bytes, …) keyed by `metric`.
 */
export default class extends BaseSchema {
    protected tableName = "tenant_usage_daily";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("tenant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("tenants")
                .onDelete("CASCADE");
            table.date("day").notNullable();
            table.string("metric", 48).notNullable();
            table.bigInteger("value").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["tenant_id", "day", "metric"], { indexName: "tenant_usage_daily_unique" });
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
