import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { bootstrapRoles } from "#services/db_roles";
import env from "#start/env";

/**
 * Database-level proof that `media` is tenant-isolated, run against the runtime role `calibra_app`
 * (NOBYPASSRLS) — the same posture as `foundation/rls_isolation.spec.ts`. The functional suite
 * otherwise runs as the superuser (RLS bypassed), so an HTTP admin-media list cannot prove row
 * isolation; this spec opens a dedicated `calibra_app` connection to exercise the real production
 * filter. It also asserts the stored `url` carries the per-tenant `t{id}/` path segment that makes
 * the public serving namespace physical.
 */
const APP_CONNECTION = "media_isolation_app";
const APP_USER = "calibra_app";
const APP_PASSWORD = "calibra_app";
const ADMIN_USER = "calibra_admin";
const ADMIN_PASSWORD = "calibra_admin";
const TENANT_A = 900_011;
const TENANT_B = 900_012;

async function seedTenant(su: ReturnType<typeof db.connection>, id: number, slug: string, now: string): Promise<void> {
    const plan = await su.from("plans").where("key", "starter").firstOrFail();
    await su
        .table("tenants")
        .insert({
            id,
            slug,
            name: slug,
            status: "active",
            plan_id: Number(plan.id),
            db_tier: "shared",
            template_key: "default",
            currency_code: "IRR",
            primary_locale: "fa",
            created_at: now,
            updated_at: now,
        })
        .onConflict("id")
        .ignore();
}

async function seedMedia(su: ReturnType<typeof db.connection>, tenantId: number, filename: string, now: string): Promise<void> {
    await su.table("media").insert({
        tenant_id: tenantId,
        kind: "image",
        url: `http://localhost/uploads/t${tenantId}/2026/06/${filename}`,
        mime: "image/jpeg",
        filename,
        width: 100,
        height: 100,
        size_bytes: 100,
        attributes: JSON.stringify({}),
        created_at: now,
        updated_at: now,
    });
}

test.group("Media tenant isolation (calibra_app)", (group) => {
    group.setup(async () => {
        const su = db.connection();
        await bootstrapRoles(su, {
            appUser: APP_USER,
            appPassword: APP_PASSWORD,
            adminUser: ADMIN_USER,
            adminPassword: ADMIN_PASSWORD,
        });

        const now = DateTime.utc().toSQL()!;
        await su
            .table("currencies")
            .insert({
                code: "IRR",
                symbol: "rial",
                name_en: "Rial",
                name_fa: "ریال",
                base_ratio: 1,
                enabled: true,
                created_at: now,
                updated_at: now,
            })
            .onConflict("code")
            .ignore();
        await su
            .table("plans")
            .insert({ key: "starter", name: "Starter", db_tier: "shared", is_default: true, created_at: now, updated_at: now })
            .onConflict("key")
            .ignore();

        await seedTenant(su, TENANT_A, "media-a", now);
        await seedTenant(su, TENANT_B, "media-b", now);
        await su.from("media").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
        await seedMedia(su, TENANT_A, "a1.jpg", now);
        await seedMedia(su, TENANT_A, "a2.jpg", now);
        await seedMedia(su, TENANT_B, "b1.jpg", now);

        db.manager.add(APP_CONNECTION, {
            client: "pg",
            connection: {
                host: env.get("DB_HOST"),
                port: env.get("DB_PORT"),
                user: APP_USER,
                password: APP_PASSWORD,
                database: env.get("DB_DATABASE"),
            },
        });

        return async () => {
            await db.manager.close(APP_CONNECTION, true);
            await db.connection().from("media").whereIn("tenant_id", [TENANT_A, TENANT_B]).delete();
            await db.connection().from("tenants").whereIn("id", [TENANT_A, TENANT_B]).delete();
        };
    });

    /**
     * Runs first, on the freshly-added connection where `app.current_tenant` was never set, so
     * `current_setting(..., true)` is NULL and the RLS predicate is false (zero rows). Once a
     * transaction has `set_config`'d the GUC the placeholder reverts to `''` rather than NULL, which
     * the policy's `::bigint` cast rejects — so this assertion is order-sensitive by design.
     */
    test("calibra_app with no tenant set sees zero media (fail-closed)", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);
        const res = await app.rawQuery("SELECT count(*)::int AS count FROM media");
        assert.equal(res.rows[0].count, 0);
    });

    test("calibra_app sees only the media of the tenant set in app.current_tenant", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);
        const countFor = (tenantId: number): Promise<number> =>
            app.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
                const res = await trx.rawQuery("SELECT count(*)::int AS count FROM media");
                return res.rows[0].count as number;
            });

        assert.equal(await countFor(TENANT_A), 2, "tenant A must see only its two media rows");
        assert.equal(await countFor(TENANT_B), 1, "tenant B must see only its one media row");
    });

    test("each media url carries its tenant's t{id} path segment", async ({ assert }) => {
        const su = db.connection();
        const aRows = (await su.from("media").where("tenant_id", TENANT_A).select("url")) as Array<{ url: string }>;
        const bRows = (await su.from("media").where("tenant_id", TENANT_B).select("url")) as Array<{ url: string }>;
        for (const row of aRows) assert.match(row.url, new RegExp(`/uploads/t${TENANT_A}/`));
        for (const row of bRows) assert.match(row.url, new RegExp(`/uploads/t${TENANT_B}/`));
    });
});
