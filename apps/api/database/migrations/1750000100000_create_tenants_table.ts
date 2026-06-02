import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * The tenant registry — the root of the multi-tenant bridge model. Global control-plane data: no
 * `tenant_id`, no RLS (a tenant cannot be hidden from itself). Every per-tenant row across the
 * schema FKs back here.
 *
 * Two columns deliberately diverge from a naive reading of the spec:
 *
 * - `currency_code` is `varchar(8)`, not `char(3)`. It FKs `currencies.code` (itself `varchar(8)`)
 *   and the seeded Rial family includes four-character codes (`IRHR`, `IRHT`) that `char(3)` cannot
 *   hold. Matching the referenced column's type also keeps the FK btree index valid.
 * - `primary_locale` is `varchar(8)` to mirror `users.locale` and avoid `char` space-padding
 *   (`'fa'` would store as `'fa      '`).
 *
 * `connection_name` is NULL for shared-DB tenants (the vast majority) and is set only when a whale
 * tenant is promoted to its own database — `resolveTenantConnection()` keys off it.
 */
export default class extends BaseSchema {
    protected tableName = "tenants";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.specificType("slug", "citext").notNullable();
            table.string("name").notNullable();
            table.string("status", 16).notNullable().defaultTo("active");
            table.bigInteger("plan_id").unsigned().notNullable().references("id").inTable("plans").onDelete("RESTRICT");
            table.string("db_tier", 16).notNullable().defaultTo("shared");
            table.string("connection_name", 64).nullable();
            table.string("template_key", 48).notNullable().defaultTo("default");
            table.string("currency_code", 8).notNullable().references("code").inTable("currencies").onDelete("RESTRICT");
            table.string("primary_locale", 8).notNullable().defaultTo("fa");
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.unique(["slug"], { indexName: "tenants_slug_unique" });
            table.index(["status"], "tenants_status_idx");
            table.index(["deleted_at"], "tenants_deleted_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenants_status_check" CHECK (status IN ('active', 'suspended', 'archived'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenants_db_tier_check" CHECK (db_tier IN ('shared', 'dedicated'))`,
        );
        /**
         * Slug format: lowercase alphanumerics with single internal dashes — no leading/trailing or
         * doubled dashes. Written WITHOUT a `?` quantifier on purpose: knex's `raw()` treats a bare
         * `?` as a bind placeholder and would mangle the pattern. `[a-z0-9]+(-[a-z0-9]+)*` expresses
         * the same intent.
         */
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenants_slug_format_check" CHECK ((slug)::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
