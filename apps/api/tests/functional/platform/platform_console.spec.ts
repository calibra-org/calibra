import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import PlatformUser from "#models/platform_user";
import User from "#models/user";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Control-plane console endpoints (overview, tenants CRUD, domains, metrics, plans). All run on the
 * `platform` guard with no tenant context (RULE A) — a shopper/shop token is rejected 401. Happy
 * paths assert against the platform OpenAPI surface. The reserved test tenant (id 100000, slug
 * `test`, plan `starter`) and `plans`/`tenant_domains` survive truncation, so each test cleans up its
 * own provisioned tenants / custom domains / plans by a `cp-` prefix.
 */
function admin() {
    return db.connection("postgres_admin");
}

let nonce = 0;
function uid(): string {
    nonce += 1;
    return `cp-${nonce}-${TEST_TENANT_ID}`;
}

async function operatorToken(client: import("@japa/api-client").ApiClient): Promise<string> {
    await PlatformUser.create({ email: "ops@calibra.dev", passwordHash: "Passw0rd1!", name: "Ops", role: "owner" });
    const login = await client.post("/api/v1/platform/auth/login").json({ email: "ops@calibra.dev", password: "Passw0rd1!" });
    return login.body().data.token.value as string;
}

async function provision(client: import("@japa/api-client").ApiClient, pat: string, slug: string): Promise<number> {
    const res = await client
        .post("/api/v1/platform/tenants")
        .header("Authorization", `Bearer ${pat}`)
        .json({ slug, name: `Shop ${slug}`, plan_key: "starter", currency_code: "IRR", owner_email: `${slug}@owner.test` });
    res.assertStatus(201);
    return Number(res.body().data.id);
}

test.group("Platform console", (group) => {
    group.each.setup(async () => {
        await admin().from("platform_users").delete();
        await admin().from("tenant_impersonation_events").delete();
        await admin().from("tenant_domains").where("kind", "custom").delete();
        await admin().from("tenants").whereILike("slug", "cp-%").delete();
        await admin().from("plans").whereILike("key", "cp-%").delete();
    });

    test("overview rejects an anonymous request (401)", async ({ client }) => {
        const res = await client.get("/api/v1/platform/overview");
        res.assertStatus(401);
    });

    test("overview rejects a shopper bearer token (401)", async ({ client }) => {
        const shopper = await User.create({
            email: "shopper@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "customer",
            locale: "fa",
        });
        const res = await client.get("/api/v1/platform/overview").withGuard("api").loginAs(shopper);
        res.assertStatus(401);
    });

    test("overview returns the fleet rollup", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const res = await client.get("/api/v1/platform/overview").header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.isAtLeast(res.body().data.shops.total, 1);
    });

    test("tenants index lists the fleet with headline KPIs", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const res = await client.get("/api/v1/platform/tenants").header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.isArray(res.body().data);
        const test = res.body().data.find((t: { id: number }) => t.id === TEST_TENANT_ID);
        assert.exists(test);
        assert.properties(test.kpis, ["orders_30d", "revenue_30d", "storage_bytes"]);
        assert.isArray(test.spark);
        assert.lengthOf(test.spark, 14);
        assert.isTrue(test.spark.every((n: unknown) => typeof n === "number"));
    });

    test("tenants index supports a free-text q search", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const res = await client.get("/api/v1/platform/tenants?q=test").header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.isTrue(res.body().data.every((t: { slug: string; name: string }) => /test/i.test(t.slug) || /test/i.test(t.name)));
    });

    test("tenants index rejects an unknown query key (422)", async ({ client }) => {
        const pat = await operatorToken(client);
        const res = await client.get("/api/v1/platform/tenants?bogus=1").header("Authorization", `Bearer ${pat}`);
        res.assertStatus(422);
    });

    test("tenant detail returns profile + usage", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const res = await client.get(`/api/v1/platform/tenants/${TEST_TENANT_ID}`).header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.slug, "test");
        assert.properties(res.body().data.usage, ["products", "orders_total", "customers_total", "storage_bytes"]);
    });

    test("tenant detail 404s for an unknown id", async ({ client }) => {
        const pat = await operatorToken(client);
        const res = await client.get("/api/v1/platform/tenants/99999999").header("Authorization", `Bearer ${pat}`);
        res.assertStatus(404);
    });

    test("provision creates a shop end-to-end and returns its URL", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const slug = uid();
        const res = await client
            .post("/api/v1/platform/tenants")
            .header("Authorization", `Bearer ${pat}`)
            .json({ slug, name: "Aurora", plan_key: "starter", currency_code: "IRR", owner_email: "owner@aurora.test" });
        res.assertStatus(201);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.slug, slug);
        assert.equal(res.body().data.shop_url, `https://${slug}.shops.calibra.app`);
        assert.equal(res.body().data.domains[0].kind, "subdomain");
    });

    test("provision rejects a reserved slug (422)", async ({ client }) => {
        const pat = await operatorToken(client);
        const res = await client
            .post("/api/v1/platform/tenants")
            .header("Authorization", `Bearer ${pat}`)
            .json({ slug: "admin", name: "X", plan_key: "starter", currency_code: "IRR", owner_email: "x@y.test" });
        res.assertStatus(422);
    });

    test("provision requires an owner email or phone (422)", async ({ client }) => {
        const pat = await operatorToken(client);
        const res = await client
            .post("/api/v1/platform/tenants")
            .header("Authorization", `Bearer ${pat}`)
            .json({ slug: uid(), name: "X", plan_key: "starter", currency_code: "IRR" });
        res.assertStatus(422);
    });

    test("update changes a shop's name and status", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const id = await provision(client, pat, uid());
        const res = await client
            .patch(`/api/v1/platform/tenants/${id}`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ name: "Renamed", status: "suspended" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.name, "Renamed");
        assert.equal(res.body().data.status, "suspended");
    });

    test("metrics returns KPIs + a dense series", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const res = await client
            .get(`/api/v1/platform/tenants/${TEST_TENANT_ID}/metrics?range=30d`)
            .header("Authorization", `Bearer ${pat}`);
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.properties(res.body().data.kpis, ["revenue", "orders", "customers_new", "customers_total", "storage_bytes"]);
        assert.isArray(res.body().data.series);
    });

    test("attach + recheck + detach a custom domain", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const domain = `shop-${nonce + 1}.example.com`;
        const attach = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        attach.assertStatus(201);
        attach.assertAgainstApiSpec();
        assert.equal(attach.body().data.tls_status, "pending");
        assert.isString(attach.body().data.cname_target);
        const domainId = attach.body().data.id;

        const recheck = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains/${domainId}/recheck`)
            .header("Authorization", `Bearer ${pat}`);
        recheck.assertStatus(200);
        recheck.assertAgainstApiSpec();

        const detach = await client
            .delete(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains/${domainId}`)
            .header("Authorization", `Bearer ${pat}`);
        detach.assertStatus(200);
        detach.assertAgainstApiSpec();
        assert.isTrue(detach.body().data.detached);
    });

    test("attach rejects a duplicate domain (409)", async ({ client }) => {
        const pat = await operatorToken(client);
        const domain = `dup-${nonce + 1}.example.com`;
        await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        const again = await client
            .post(`/api/v1/platform/tenants/${TEST_TENANT_ID}/domains`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ domain });
        again.assertStatus(409);
    });

    test("plans index lists tiers; create + update manage them", async ({ client, assert }) => {
        const pat = await operatorToken(client);
        const index = await client.get("/api/v1/platform/plans").header("Authorization", `Bearer ${pat}`);
        index.assertStatus(200);
        index.assertAgainstApiSpec();

        const key = uid();
        const create = await client
            .post("/api/v1/platform/plans")
            .header("Authorization", `Bearer ${pat}`)
            .json({ key, name: "Growth", db_tier: "shared", limits: { max_products: 5000 } });
        create.assertStatus(201);
        create.assertAgainstApiSpec();
        const planId = create.body().data.id;
        assert.equal(create.body().data.limits.max_products, 5000);

        const update = await client
            .patch(`/api/v1/platform/plans/${planId}`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ name: "Growth+", db_tier: "dedicated" });
        update.assertStatus(200);
        update.assertAgainstApiSpec();
        assert.equal(update.body().data.name, "Growth+");
        assert.equal(update.body().data.db_tier, "dedicated");
    });

    test("plans create rejects a duplicate key (409)", async ({ client }) => {
        const pat = await operatorToken(client);
        const res = await client
            .post("/api/v1/platform/plans")
            .header("Authorization", `Bearer ${pat}`)
            .json({ key: "starter", name: "Dup" });
        res.assertStatus(409);
    });
});
