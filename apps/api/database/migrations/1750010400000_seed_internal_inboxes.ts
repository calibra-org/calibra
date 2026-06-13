import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Backfill the always-on internal inboxes + the support-admin roster for tenants that already exist
 * when ticketing ships. Two inboxes per tenant:
 *  - `internal_web` — the shop's own customer support surface (default).
 *  - `internal_platform` — the shop ↔ Calibra platform-support channel (default).
 *
 * Every existing `role = 'admin'` user becomes a `support_admin` agent with `access_tier = 'all'`
 * so the shop has at least one operator who can see the whole inbox on day one. New tenants get the
 * same treatment from `tenant_provisioning_service.ts` (the live path); this migration only covers
 * the already-provisioned ones.
 *
 * Runs on `postgres_admin` (BYPASSRLS) like every migration, so `tenant_id` is written explicitly.
 * All statements are idempotent (`WHERE NOT EXISTS`) — safe to re-run.
 */
export default class extends BaseSchema {
    async up() {
        /** One default internal_web inbox per tenant. */
        this.schema.raw(`
            INSERT INTO "ticketing_inboxes" ("tenant_id", "name", "channel_type", "is_default", "status", "created_at", "updated_at")
            SELECT t."id", 'Support', 'internal_web', true, 'active', now(), now()
            FROM "tenants" t
            WHERE NOT EXISTS (
                SELECT 1 FROM "ticketing_inboxes" i
                WHERE i."tenant_id" = t."id" AND i."channel_type" = 'internal_web'
            )
        `);

        /** One default internal_platform inbox per tenant (shop ↔ Calibra). */
        this.schema.raw(`
            INSERT INTO "ticketing_inboxes" ("tenant_id", "name", "channel_type", "is_default", "status", "created_at", "updated_at")
            SELECT t."id", 'Calibra Support', 'internal_platform', true, 'active', now(), now()
            FROM "tenants" t
            WHERE NOT EXISTS (
                SELECT 1 FROM "ticketing_inboxes" i
                WHERE i."tenant_id" = t."id" AND i."channel_type" = 'internal_platform'
            )
        `);

        /** Promote existing shop admins to support_admin agents with full access. */
        this.schema.raw(`
            INSERT INTO "ticketing_agents" ("tenant_id", "user_id", "support_role", "access_tier", "can_reassign", "status", "created_at", "updated_at")
            SELECT u."tenant_id", u."id", 'support_admin', 'all', true, 'active', now(), now()
            FROM "users" u
            WHERE u."role" = 'admin'
            AND NOT EXISTS (
                SELECT 1 FROM "ticketing_agents" a
                WHERE a."tenant_id" = u."tenant_id" AND a."user_id" = u."id"
            )
        `);
    }

    async down() {
        /** Forward-only seed; the create migrations' down() drops the tables wholesale. */
        this.schema.raw(`DELETE FROM "ticketing_agents" WHERE "support_role" = 'support_admin' AND "access_tier" = 'all'`);
        this.schema.raw(`DELETE FROM "ticketing_inboxes" WHERE "channel_type" IN ('internal_web', 'internal_platform')`);
    }
}
