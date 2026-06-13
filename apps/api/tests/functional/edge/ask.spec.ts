import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Edge TLS-authorize oracle (`GET /api/caddy/ask`). The single unauthenticated, BYPASSRLS-facing
 * surface: source-allowlisted on `X-Edge-Secret`, returns ONLY a boolean (200/403, empty body), and
 * 200s exactly for hosts routable under the R5 predicate (subdomains always; customs need both
 * gates + a verifying/active cert). `.env.test` sets `EDGE_SECRET=test-edge-secret`.
 */
function admin() {
    return db.connection("postgres_admin");
}

const SECRET = "test-edge-secret";

async function insertDomain(domain: string, kind: string, fields: Record<string, unknown> = {}): Promise<void> {
    const now = DateTime.utc().toSQL()!;
    await admin()
        .table("tenant_domains")
        .insert({
            tenant_id: TEST_TENANT_ID,
            domain,
            kind,
            is_primary: false,
            tls_status: "pending",
            created_at: now,
            updated_at: now,
            ...fields,
        });
}

test.group("Edge ask endpoint", (group) => {
    group.each.setup(async () => {
        await admin().from("tenant_domains").whereILike("domain", "%.ask-test.example").delete();
        await admin().from("tenant_domains").whereILike("domain", "%.ask-test.localhost").delete();
    });

    test("rejects a caller with no edge secret (403)", async ({ client }) => {
        await insertDomain("sub.ask-test.localhost", "subdomain", {
            tls_status: "active",
            ownership_verified_at: DateTime.utc().toSQL(),
            routing_verified_at: DateTime.utc().toSQL(),
        });
        const res = await client.get("/api/caddy/ask?domain=sub.ask-test.localhost");
        res.assertStatus(403);
    });

    test("rejects a wrong edge secret (403)", async ({ client }) => {
        const res = await client.get("/api/caddy/ask?domain=sub.ask-test.localhost").header("X-Edge-Secret", "nope");
        res.assertStatus(403);
    });

    test("subdomains always route (200, empty body)", async ({ client, assert }) => {
        await insertDomain("sub.ask-test.localhost", "subdomain");
        const res = await client.get("/api/caddy/ask?domain=sub.ask-test.localhost").header("X-Edge-Secret", SECRET);
        res.assertStatus(200);
        assert.isEmpty(res.body());
    });

    test("a fully-verified custom domain routes (200)", async ({ client }) => {
        await insertDomain("ok.ask-test.example", "custom", {
            tls_status: "active",
            ownership_verified_at: DateTime.utc().toSQL(),
            routing_verified_at: DateTime.utc().toSQL(),
        });
        const res = await client.get("/api/caddy/ask?domain=ok.ask-test.example").header("X-Edge-Secret", SECRET);
        res.assertStatus(200);
    });

    test("an unverified custom domain does NOT route (403)", async ({ client }) => {
        await insertDomain("pending.ask-test.example", "custom", { tls_status: "pending" });
        const res = await client.get("/api/caddy/ask?domain=pending.ask-test.example").header("X-Edge-Secret", SECRET);
        res.assertStatus(403);
    });

    test("a half-verified custom domain (ownership only) does NOT route (403)", async ({ client }) => {
        await insertDomain("half.ask-test.example", "custom", {
            tls_status: "verifying",
            ownership_verified_at: DateTime.utc().toSQL(),
        });
        const res = await client.get("/api/caddy/ask?domain=half.ask-test.example").header("X-Edge-Secret", SECRET);
        res.assertStatus(403);
    });

    test("an unknown host returns 403 and leaks nothing", async ({ client, assert }) => {
        const res = await client.get("/api/caddy/ask?domain=nobody.ask-test.example").header("X-Edge-Secret", SECRET);
        res.assertStatus(403);
        assert.isEmpty(res.body());
    });
});
