import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import PlatformUser from "#models/platform_user";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Control-plane (platform) auth + impersonation. Platform routes are global — no tenant context — and
 * authenticate against `platform_access_tokens` via the dedicated `platform` guard, so a shopper/shop
 * bearer token can never reach them. Happy paths assert against the platform OpenAPI surface.
 */
async function createOperator(email = "ops@calibra.dev", password = "Passw0rd1!"): Promise<PlatformUser> {
    return PlatformUser.create({ email, passwordHash: password, name: "Ops", role: "owner" });
}

async function createShopAdmin(): Promise<User> {
    const now = DateTime.utc().toSQL()!;
    const rows = await db
        .connection("postgres_admin")
        .table("users")
        .insert({
            tenant_id: TEST_TENANT_ID,
            email: `admin-${Date.now()}@shop.test`,
            password_hash: "x",
            role: "admin",
            locale: "fa",
            created_at: now,
            updated_at: now,
        })
        .returning(["id"]);
    return (await User.query({ client: db.connection("postgres_admin") })
        .where("id", Number(rows[0].id))
        .firstOrFail()) as User;
}

test.group("Platform auth + impersonation", (group) => {
    group.each.setup(async () => {
        const conn = db.connection("postgres_admin");
        await conn.from("platform_users").delete();
        await conn.from("tenant_impersonation_events").delete();
        /**
         * Start from a clean user/customer slate regardless of sibling-spec residue. Several specs
         * hardcode fixture emails (e.g. `shopper@calibra.dev`) and create customers linked to admin
         * users; without a global per-test truncate, whichever spec ran first in the shard leaves
         * rows that collide here (`users_tenant_email_unique`) or block a delete
         * (`customers_user_id_foreign`). Truncating the phase-03 tables (CASCADE) is the same
         * isolation the tenant-scoped specs already use.
         */
        await truncatePhase03Tables();
    });

    test("login mints a pat_ token for a valid operator", async ({ client, assert }) => {
        await createOperator();
        const response = await client
            .post("/api/v1/platform/auth/login")
            .json({ email: "ops@calibra.dev", password: "Passw0rd1!" });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body();
        assert.match(body.data.token.value, /^pat_/);
        assert.equal(body.data.platform_user.email, "ops@calibra.dev");
    });

    test("login rejects a wrong password", async ({ client }) => {
        await createOperator();
        const response = await client.post("/api/v1/platform/auth/login").json({ email: "ops@calibra.dev", password: "wrong" });
        response.assertStatus(400);
    });

    test("impersonate rejects a request with no token (401)", async ({ client }) => {
        const response = await client.post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/impersonate`).json({});
        response.assertStatus(401);
    });

    test("impersonate rejects a shopper bearer token (401)", async ({ client }) => {
        const shopper = await User.create({
            email: "shopper@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const response = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/impersonate`)
            .withGuard("api")
            .loginAs(shopper)
            .json({});
        response.assertStatus(401);
    });

    test("impersonate mints a shop-admin token, audits, and /auth/me reports impersonated_by", async ({ client, assert }) => {
        const operator = await createOperator();
        const admin = await createShopAdmin();
        const login = await client.post("/api/v1/platform/auth/login").json({ email: "ops@calibra.dev", password: "Passw0rd1!" });
        const pat = login.body().data.token.value as string;

        const impersonate = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/impersonate`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ target_user_id: Number(admin.id), reason: "support" });
        impersonate.assertStatus(200);
        impersonate.assertAgainstApiSpec();
        const grant = impersonate.body().data;
        assert.isString(grant.token.value);
        assert.isString(grant.admin_url);

        const event = await db
            .connection("postgres_admin")
            .from("tenant_impersonation_events")
            .where("target_user_id", Number(admin.id))
            .whereNull("ended_at")
            .first();
        assert.isNotNull(event);
        assert.equal(Number(event.platform_user_id), Number(operator.id));

        const me = await client.get("/api/v1/auth/me").header("Authorization", `Bearer ${grant.token.value}`);
        me.assertStatus(200);
        me.assertAgainstApiSpec();
        assert.equal(me.body().impersonated_by, Number(operator.id));
    });

    test("impersonation/stop ends the audit event and revokes the token", async ({ client, assert }) => {
        const admin = await createShopAdmin();
        await createOperator();
        const login = await client.post("/api/v1/platform/auth/login").json({ email: "ops@calibra.dev", password: "Passw0rd1!" });
        const pat = login.body().data.token.value as string;
        const impersonate = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/impersonate`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ target_user_id: Number(admin.id), reason: "support" });
        const sessionToken = impersonate.body().data.token.value as string;

        const stop = await client.post("/api/v1/auth/impersonation/stop").header("Authorization", `Bearer ${sessionToken}`);
        stop.assertStatus(200);
        stop.assertAgainstApiSpec();
        assert.isTrue(stop.body().data.ended);

        const event = await db
            .connection("postgres_admin")
            .from("tenant_impersonation_events")
            .where("target_user_id", Number(admin.id))
            .first();
        assert.isNotNull(event.ended_at);

        /** The revoked token can no longer authenticate. */
        const after = await client.get("/api/v1/auth/me").header("Authorization", `Bearer ${sessionToken}`);
        after.assertStatus(401);
    });
});
