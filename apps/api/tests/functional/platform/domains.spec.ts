import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import PlatformUser from "#models/platform_user";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Custom-domain verification state machine + audit (`/api/v1/platform/tenants/:id/domains`). Attach
 * records intent (`pending` + the TXT/CNAME records to publish); `recheck` drives ownership → routing
 * → active. The happy path toggles `SPIN_SIMULATE_DNS` so the DNS checks pass deterministically
 * without real records. Every mutation writes a `platform_audit_events` row.
 */
function admin() {
    return db.connection("postgres_admin");
}

let nonce = 0;
function domainName(): string {
    nonce += 1;
    return `cp-dom-${nonce}.example.com`;
}

async function operatorToken(client: import("@japa/api-client").ApiClient): Promise<string> {
    await PlatformUser.create({ email: "ops-dom@calibra.dev", passwordHash: "Passw0rd1!", name: "Ops", role: "owner" });
    const login = await client.post("/api/v1/platform/auth/login").json({ email: "ops-dom@calibra.dev", password: "Passw0rd1!" });
    return login.body().data.token.value as string;
}

test.group("Platform domains verification", (group) => {
    group.each.setup(async () => {
        await admin().from("platform_users").delete();
        await admin().from("platform_audit_events").delete();
        await admin().from("tenant_domains").where("kind", "custom").delete();
    });
    group.each.teardown(() => {
        process.env.SPIN_SIMULATE_DNS = undefined;
        delete process.env.SPIN_SIMULATE_DNS;
    });

    test("attach records intent + the DNS records to publish", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const domain = domainName();
        const res = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        res.assertStatus(201);
        res.assertAgainstApiSpec();
        const body = res.body().data;
        assert.equal(body.tls_status, "pending");
        assert.isFalse(body.ownership_verified);
        assert.isFalse(body.routing_verified);
        assert.equal(body.ownership.record_name, `_calibra-verify.${domain}`);
        assert.equal(body.ownership.record_type, "TXT");
        assert.isString(body.ownership.record_value);
        assert.equal(body.routing.record_type, "CNAME");
        assert.isString(body.routing.record_value);

        const audit = await admin()
            .from("platform_audit_events")
            .where("action", "domain_added")
            .where("tenant_id", TEST_TENANT_ID)
            .first();
        assert.exists(audit);
    });

    test("recheck drives ownership → routing → active under simulation", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const domain = domainName();
        const attach = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        const domainId = attach.body().data.id;

        process.env.SPIN_SIMULATE_DNS = "1";

        const first = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains/${domainId}/recheck`)
            .header("Authorization", `Bearer ${pat}`);
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.isTrue(first.body().data.ownership_verified);
        assert.isFalse(first.body().data.routing_verified);
        assert.equal(first.body().data.tls_status, "verifying");
        assert.isTrue(first.body().data.simulated);

        const second = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains/${domainId}/recheck`)
            .header("Authorization", `Bearer ${pat}`);
        second.assertStatus(200);
        second.assertAgainstApiSpec();
        assert.isTrue(second.body().data.ownership_verified);
        assert.isTrue(second.body().data.routing_verified);
        assert.equal(second.body().data.tls_status, "active");
        assert.isTrue(second.body().data.simulated);
    });

    test("recheck without simulation leaves an unprovable domain pending + records the error", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const domain = domainName();
        const attach = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        const domainId = attach.body().data.id;

        const res = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains/${domainId}/recheck`)
            .header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.tls_status, "pending");
        assert.isFalse(res.body().data.ownership_verified);
        assert.isString(res.body().data.cert_last_error);
        assert.isFalse(res.body().data.simulated);
    });

    test("recheck 404s when the domain belongs to another tenant (tenant_id filter)", async ({ client }) => {
        const pat = await operatorToken(client);
        const domain = domainName();
        const attach = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        const domainId = attach.body().data.id;

        const res = await client
            .post(`/api/v1/platform/tenants/99999999/domains/${domainId}/recheck`)
            .header("Authorization", `Bearer ${pat}`);
        res.assertStatus(404);
    });

    test("detach removes the row + audits domain_removed", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const domain = domainName();
        const attach = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        const domainId = attach.body().data.id;

        const detach = await client
            .delete(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains/${domainId}`)
            .header("Authorization", `Bearer ${pat}`);
        detach.assertStatus(200);
        assert.isTrue(detach.body().data.detached);

        const audit = await admin()
            .from("platform_audit_events")
            .where("action", "domain_removed")
            .where("tenant_id", TEST_TENANT_ID)
            .first();
        assert.exists(audit);
    });
});
