import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import PlatformUser from "#models/platform_user";

/**
 * Control-plane operator management. Provisions a fresh shop (owner auto-created + `owner_user_id`
 * set), then exercises list / create / disable / owner-guard / last-admin-guard / make-owner. All
 * mutations are scoped by `tenant_id`, revoke `oat_` tokens (never `pat_`), and write
 * `platform_audit_events`.
 */
function admin() {
    return db.connection("postgres_admin");
}

let nonce = 0;
function slug(): string {
    nonce += 1;
    return `cp-ops-${nonce}`;
}

async function operatorToken(client: import("@japa/api-client").ApiClient): Promise<string> {
    await PlatformUser.create({ email: "ops-op@calibra.dev", passwordHash: "Passw0rd1!", name: "Ops", role: "owner" });
    const login = await client.post("/api/v1/platform/auth/login").json({ email: "ops-op@calibra.dev", password: "Passw0rd1!" });
    return login.body().data.token.value as string;
}

async function provision(client: import("@japa/api-client").ApiClient, pat: string): Promise<number> {
    const s = slug();
    const res = await client
        .post("/api/v1/platform/tenants")
        .header("Authorization", `Bearer ${pat}`)
        .json({ slug: s, name: `Shop ${s}`, plan_key: "starter", currency_code: "IRR", owner_email: `${s}@owner.test` });
    res.assertStatus(201);
    return Number(res.body().data.id);
}

test.group("Platform operators", (group) => {
    group.each.setup(async () => {
        await admin().from("platform_users").delete();
        await admin().from("platform_audit_events").delete();
        await admin().from("tenants").whereILike("slug", "cp-ops-%").delete();
    });

    test("provision reveals owner credentials once + forces a change", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const s = slug();
        const res = await client
            .post("/api/v1/platform/tenants")
            .header("Authorization", `Bearer ${pat}`)
            .json({ slug: s, name: "Aurora", plan_key: "starter", currency_code: "IRR", owner_email: `${s}@owner.test` });
        res.assertStatus(201);
        assert.equal(res.body().data.owner_credentials.email, `${s}@owner.test`);
        assert.isString(res.body().data.owner_credentials.temp_password);
        assert.isTrue(res.body().data.owner_credentials.must_change_password);
        assert.notEqual(res.body().data.owner_credentials.temp_password, "ChangeMe123!");
    });

    test("list includes the owner with a store_owner badge", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const id = await provision(client, pat);
        const res = await client.get(`/api/v1/platform/tenants/${id}/operators`).header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        const owner = res.body().data.find((o: { is_store_owner: boolean }) => o.is_store_owner);
        assert.exists(owner);
        assert.isFalse(owner.capabilities.can_disable);
        assert.isFalse(owner.capabilities.can_remove);
    });

    test("create an operator reveals a temp password", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const id = await provision(client, pat);
        const res = await client
            .post(`/api/v1/platform/tenants/${id}/operators`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ email: "staff@shop.test" });
        res.assertStatus(201);
        res.assertAgainstApiSpec();
        assert.isNumber(res.body().data.id);
        assert.isString(res.body().credentials.temp_password);
    });

    test("cannot disable the store owner (422)", async ({ client }) => {
        const pat = await operatorToken(client);
        const id = await provision(client, pat);
        const list = await client.get(`/api/v1/platform/tenants/${id}/operators`).header("Authorization", `Bearer ${pat}`);
        const owner = list.body().data.find((o: { is_store_owner: boolean }) => o.is_store_owner);
        const res = await client
            .patch(`/api/v1/platform/tenants/${id}/operators/${owner.id}/disable`)
            .header("Authorization", `Bearer ${pat}`);
        res.assertStatus(422);
    });

    test("disable + enable a non-owner operator", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const id = await provision(client, pat);
        const created = await client
            .post(`/api/v1/platform/tenants/${id}/operators`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ email: "staff2@shop.test" });
        const opId = created.body().data.id;

        const disabled = await client
            .patch(`/api/v1/platform/tenants/${id}/operators/${opId}/disable`)
            .header("Authorization", `Bearer ${pat}`);
        disabled.assertStatus(200);
        assert.equal(disabled.body().data.status, "disabled");

        const enabled = await client
            .patch(`/api/v1/platform/tenants/${id}/operators/${opId}/enable`)
            .header("Authorization", `Bearer ${pat}`);
        enabled.assertStatus(200);

        const audit = await admin().from("platform_audit_events").where("action", "operator_disabled").first();
        assert.exists(audit);
    });

    test("make-owner transfers ownership", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const id = await provision(client, pat);
        const created = await client
            .post(`/api/v1/platform/tenants/${id}/operators`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ email: "newowner@shop.test" });
        const opId = created.body().data.id;

        const res = await client
            .post(`/api/v1/platform/tenants/${id}/operators/${opId}/make-owner`)
            .header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        assert.isTrue(res.body().data.is_store_owner);

        const audit = await admin().from("platform_audit_events").where("action", "ownership_transferred").first();
        assert.exists(audit);
    });
});
