import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Ticketing overlays — tags and canned responses. Pure per-tenant convenience data layered over the
 * conversation core; same RLS contract as every other `ticketing_*` table (R2).
 */
export default class extends BaseSchema {
    /**
     * Apply the per-tenant isolation contract (GUC default + FORCE RLS + NULL-safe policy) to a
     * freshly created table. See `1750010000000` for the rationale.
     */
    private enableTenantRls(table: string) {
        this.schema.raw(
            `ALTER TABLE "${table}" ALTER COLUMN "tenant_id" SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
        );
        this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY "tenant_isolation" ON "${table}" ` +
                `USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint) ` +
                `WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint)`,
        );
    }

    async up() {
        this.schema.createTable("ticketing_tags", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.specificType("name", "citext").notNullable();
            table.string("color", 16).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["tenant_id", "name"], { indexName: "ticketing_tags_name_unique" });
        });
        this.enableTenantRls("ticketing_tags");

        this.schema.createTable("ticketing_conversation_tags", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("conversation_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_conversations")
                .onDelete("CASCADE");
            table.bigInteger("tag_id").unsigned().notNullable().references("id").inTable("ticketing_tags").onDelete("CASCADE");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["tenant_id", "conversation_id", "tag_id"], { indexName: "ticketing_conversation_tags_unique" });
        });
        this.enableTenantRls("ticketing_conversation_tags");

        this.schema.createTable("ticketing_canned_responses", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.specificType("shortcut", "citext").notNullable();
            table.string("title").notNullable();
            table.text("body").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["tenant_id", "shortcut"], { indexName: "ticketing_canned_responses_shortcut_unique" });
        });
        this.enableTenantRls("ticketing_canned_responses");
    }

    async down() {
        this.schema.dropTableIfExists("ticketing_canned_responses");
        this.schema.dropTableIfExists("ticketing_conversation_tags");
        this.schema.dropTableIfExists("ticketing_tags");
    }
}
