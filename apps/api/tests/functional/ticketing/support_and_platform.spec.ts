import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import PlatformUser from "#models/platform_user";
import User from "#models/user";
import { ensureTestTenant, TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * The two-context proof (R5): the shop-admin → Calibra surface (`/api/v1/admin/support`) and the
 * control-plane queue (`/api/v1/platform/tickets`) are the SAME conversation core with different
 * identity + connection. Asserts: a shop owner opens a ticket and a platform operator sees + replies
 * to it; a regular support agent does NOT see the shop's tickets-to-Calibra; the platform queue is
 * `platform_internal` only.
 */
async function resetTicketing(): Promise<void> {
    const conn = db.connection("postgres_admin");
    const order = [
        "ticketing_inbound_events",
        "ticketing_attachments",
        "ticketing_messages",
        "ticketing_conversation_participants",
        "ticketing_conversation_tags",
        "ticketing_conversations",
        "ticketing_channel_identities",
        "ticketing_inbox_members",
        "ticketing_canned_responses",
        "ticketing_tags",
        "channel_secrets",
        "ticketing_inboxes",
        "channel_connections",
        "ticketing_agents",
    ];
    for (const table of order) {
        await conn.from(table).delete();
    }
}

async function makeAdmin(email: string): Promise<User> {
    return User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
}

async function makeAgent(userId: number, accessTier: string, supportRole: string): Promise<void> {
    const conn = db.connection("postgres_admin");
    const now = new Date();
    await conn.table("ticketing_agents").insert({
        tenant_id: TEST_TENANT_ID,
        user_id: userId,
        support_role: supportRole,
        access_tier: accessTier,
        can_reassign: supportRole === "support_admin",
        status: "active",
        created_at: now,
        updated_at: now,
    });
}

async function makePlatformInbox(): Promise<void> {
    const conn = db.connection("postgres_admin");
    const now = new Date();
    await conn.table("ticketing_inboxes").insert({
        tenant_id: TEST_TENANT_ID,
        name: "Calibra Support",
        channel_type: "internal_platform",
        is_default: true,
        status: "active",
        created_at: now,
        updated_at: now,
    });
}

async function operatorToken(client: import("@japa/api-client").ApiClient): Promise<string> {
    await PlatformUser.create({ email: "ops-tickets@calibra.dev", passwordHash: "Passw0rd1!", name: "Ops", role: "owner" });
    const login = await client
        .post("/api/v1/platform/auth/login")
        .json({ email: "ops-tickets@calibra.dev", password: "Passw0rd1!" });
    return login.body().data.token.value as string;
}

test.group("support + platform tickets", (group) => {
    group.each.setup(async () => {
        await ensureTestTenant();
        await resetTicketing();
        await makePlatformInbox();
    });

    test("shop owner opens a ticket to Calibra and sees it; a regular agent cannot", async ({ client, assert }) => {
        const owner = await makeAdmin("sp-owner@calibra.dev");
        await makeAgent(Number(owner.id), "all", "support_admin");
        const agent = await makeAdmin("sp-agent@calibra.dev");
        await makeAgent(Number(agent.id), "unassigned_and_own", "agent");

        const opened = await client
            .post("/api/v1/admin/support")
            .withGuard("api")
            .loginAs(owner)
            .json({ subject: "Billing question", body: "How do I upgrade my plan?" });
        opened.assertStatus(201);
        assert.equal(opened.body().data.context, "platform_internal");

        const ownerList = await client.get("/api/v1/admin/support").withGuard("api").loginAs(owner);
        ownerList.assertStatus(200);
        assert.equal(ownerList.body().data.length, 1);

        const agentList = await client.get("/api/v1/admin/support").withGuard("api").loginAs(agent);
        agentList.assertStatus(422);
    });

    test("a platform operator sees the ticket across shops and replies; the shop sees the reply", async ({ client, assert }) => {
        const owner = await makeAdmin("sp-owner2@calibra.dev");
        await makeAgent(Number(owner.id), "all", "support_admin");
        const opened = await client
            .post("/api/v1/admin/support")
            .withGuard("api")
            .loginAs(owner)
            .json({ subject: "Need help", body: "Domain not resolving" });
        opened.assertStatus(201);
        const ticketId = opened.body().data.id;

        const pat = await operatorToken(client);

        const queue = await client.get("/api/v1/platform/tickets").header("Authorization", `Bearer ${pat}`);
        queue.assertStatus(200);
        assert.isAtLeast(queue.body().meta.total, 1);

        const reply = await client
            .post(`/api/v1/platform/tickets/${ticketId}/messages`)
            .header("Authorization", `Bearer ${pat}`)
            .json({ body: "We are looking into it." });
        reply.assertStatus(201);
        assert.equal(reply.body().data.direction, "outbound");
        assert.equal(reply.body().data.author_kind, "platform_user");

        const shopView = await client.get(`/api/v1/admin/support/${ticketId}`).withGuard("api").loginAs(owner);
        shopView.assertStatus(200);
        const bodies = shopView.body().data.messages.map((m: { body: string }) => m.body);
        assert.include(bodies, "We are looking into it.");
    });

    test("the platform queue rejects a shop token", async ({ client }) => {
        const res = await client
            .get("/api/v1/platform/tickets")
            .withGuard("api")
            .loginAs(await makeAdmin("sp-x@calibra.dev"));
        res.assertStatus(401);
    });
});
