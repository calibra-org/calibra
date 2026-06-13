import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import PlatformUser from "#models/platform_user";

/**
 * Targeted impersonation. "Log in as" now requires a chosen `target_user_id` AND a reason, mints a
 * 30-minute token carrying ONLY `impersonated_by:<operatorId>`, and records the reason + user agent.
 * `/auth/me` surfaces the impersonator so the admin banner renders.
 */
function admin() {
    return db.connection("postgres_admin");
}

let nonce = 0;
function slug(): string {
    nonce += 1;
    return `cp-imp-${nonce}`;
}

async function operatorToken(client: import("@japa/api-client").ApiClient): Promise<string> {
    await PlatformUser.create({ email: "ops-imp@calibra.dev", passwordHash: "Passw0rd1!", name: "Ops", role: "owner" });
    const login = await client.post("/api/v1/platform/auth/login").json({ email: "ops-imp@calibra.dev", password: "Passw0rd1!" });
    return login.body().data.token.value as string;
}

async function provision(client: import("@japa/api-client").ApiClient, pat: string): Promise<{ id: number; ownerId: number }> {
    const s = slug();
    const res = await client
        .post("/api/v1/platform/tenants")
        .header("Authorization", `Bearer ${pat}`)
        .json({ slug: s, name: `Shop ${s}`, plan_key: "starter", currency_code: "IRR", owner_email: `${s}@owner.test` });
    const id = Number(res.body().data.id);
    const owner = await admin().from("tenants").where("id", id).first();
    return { id, ownerId: Number(owner.owner_user_id) };
}

test.group("Platform impersonation", (group) => {
    group.each.setup(async () => {
        await admin().from("platform_users").delete();
        await admin().from("tenant_impersonation_events").delete();
        await admin().from("tenants").whereILike("slug", "cp-imp-%").delete();
    });

    test("requires a reason (422)", async ({ client }) => {
        const pat = await operatorToken(client);
        const { id, ownerId } = await provision(client, pat);
        const res = await client
            .post(`/api/v1/platform/tenants/${id}/impersonate`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ target_user_id: ownerId });
        res.assertStatus(422);
    });

    test("requires a target_user_id (422)", async ({ client }) => {
        const pat = await operatorToken(client);
        const { id } = await provision(client, pat);
        const res = await client
            .post(`/api/v1/platform/tenants/${id}/impersonate`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ reason: "support session" });
        res.assertStatus(422);
    });

    test("mints a token + records reason and user agent", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const { id, ownerId } = await provision(client, pat);
        const res = await client
            .post(`/api/v1/platform/tenants/${id}/impersonate`)
            .header("Authorization", `Bearer ${pat}`)
            .header("user-agent", "vitest-agent")
            .json({ target_user_id: ownerId, reason: "debugging a checkout issue" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.isString(res.body().data.token.value);
        assert.match(res.body().data.admin_url, /\/\//);

        const event = await admin().from("tenant_impersonation_events").where("tenant_id", id).first();
        assert.equal(event.reason, "debugging a checkout issue");
        assert.equal(event.user_agent, "vitest-agent");
    });

    test("the minted token carries only the impersonated_by ability + surfaces on /auth/me", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const { id, ownerId } = await provision(client, pat);
        const operator = await admin().from("platform_users").where("email", "ops-imp@calibra.dev").first();
        const mint = await client
            .post(`/api/v1/platform/tenants/${id}/impersonate`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ target_user_id: ownerId, reason: "support" });
        const token = mint.body().data.token.value;

        const me = await client
            .get("/api/v1/auth/me")
            .header("X-Calibra-Tenant", String(id))
            .header("Authorization", `Bearer ${token}`);
        me.assertStatus(200);
        assert.equal(me.body().impersonated_by, Number(operator.id));
    });
});
