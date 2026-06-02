import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Hostname → tenant routing table. Global control-plane data (the tenant-context middleware resolves
 * the request's tenant from here on the admin connection, before any RLS context exists). One
 * `subdomain` row (`<slug>.shops.calibra.app`) is auto-created at provisioning; operators may add
 * `custom` rows later. The partial unique index guarantees exactly one primary domain per tenant.
 */
export default class extends BaseSchema {
    protected tableName = "tenant_domains";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.specificType("domain", "citext").notNullable();
            table.string("kind", 16).notNullable();
            table.boolean("is_primary").notNullable().defaultTo(false);
            table.string("tls_status", 16).notNullable().defaultTo("pending");
            table.timestamp("verified_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["domain"], { indexName: "tenant_domains_domain_unique" });
            table.index(["tenant_id"], "tenant_domains_tenant_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenant_domains_kind_check" CHECK (kind IN ('subdomain', 'custom'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenant_domains_tls_status_check" CHECK (tls_status IN ('pending', 'active', 'failed'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "tenant_domains_one_primary_idx" ON "${this.tableName}" (tenant_id) WHERE is_primary`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
