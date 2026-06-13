import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Ticketing agents + inbox membership. A `ticketing_agents` row promotes a tenant `user` into a
 * support actor with a `support_role` and an `access_tier` — the latter is the load-bearing
 * authorization knob enforced by `agent_access.ts` on EVERY list/detail/mutation (never trusted
 * from the client):
 *  - `all` → sees every conversation in the tenant.
 *  - `unassigned_and_own` → sees only conversations assigned to them or unassigned.
 *  - `participating` → sees only conversations they participate in.
 *
 * Control-plane agents are global `platform_users`, not rows here (see R1/R5) — this table is the
 * shop-side roster only. Also resolves the forward reference from `1750010000000`:
 * `ticketing_conversations.assignee_agent_id` gains its FK now that the target table exists.
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
        this.schema.createTable("ticketing_agents", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("support_role", 16).notNullable().defaultTo("agent");
            table.string("access_tier", 24).notNullable().defaultTo("unassigned_and_own");
            table.boolean("can_reassign").notNullable().defaultTo(false);
            table.integer("max_open_capacity").nullable();
            table.string("status", 16).notNullable().defaultTo("active");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id"], "ticketing_agents_tenant_id_idx");
            table.unique(["tenant_id", "user_id"], { indexName: "ticketing_agents_user_unique" });
        });
        this.schema.raw(
            `ALTER TABLE "ticketing_agents" ADD CONSTRAINT "ticketing_agents_support_role_check" CHECK (support_role IN ('agent', 'supervisor', 'support_admin'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_agents" ADD CONSTRAINT "ticketing_agents_access_tier_check" CHECK (access_tier IN ('all', 'unassigned_and_own', 'participating'))`,
        );
        this.schema.raw(
            `ALTER TABLE "ticketing_agents" ADD CONSTRAINT "ticketing_agents_status_check" CHECK (status IN ('active', 'disabled'))`,
        );
        this.enableTenantRls("ticketing_agents");

        this.schema.createTable("ticketing_inbox_members", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("inbox_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_inboxes")
                .onDelete("CASCADE");
            table
                .bigInteger("agent_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("ticketing_agents")
                .onDelete("CASCADE");

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id"], "ticketing_inbox_members_tenant_id_idx");
            table.unique(["tenant_id", "inbox_id", "agent_id"], { indexName: "ticketing_inbox_members_unique" });
        });
        this.enableTenantRls("ticketing_inbox_members");

        /** Resolve the forward reference declared in 1750010000000. */
        this.schema.raw(
            `ALTER TABLE "ticketing_conversations" ADD CONSTRAINT "ticketing_conversations_assignee_agent_id_foreign" ` +
                `FOREIGN KEY ("assignee_agent_id") REFERENCES "ticketing_agents" ("id") ON DELETE SET NULL`,
        );
    }

    async down() {
        this.schema.raw(
            `ALTER TABLE "ticketing_conversations" DROP CONSTRAINT IF EXISTS "ticketing_conversations_assignee_agent_id_foreign"`,
        );
        this.schema.dropTableIfExists("ticketing_inbox_members");
        this.schema.dropTableIfExists("ticketing_agents");
    }
}
