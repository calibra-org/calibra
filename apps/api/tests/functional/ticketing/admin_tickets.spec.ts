import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import User from "#models/user";
import { ensureTestTenant, TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * Shop agent inbox (`/api/v1/admin/tickets`). Covers the load-bearing access-tier scoping (R5): a
 * `support_admin` (tier `all`) sees the whole inbox; an `unassigned_and_own` agent sees only its own
 * + unassigned conversations. Plus reply/internal-note semantics and the R6 not_available_in_region
 * gate. (OpenAPI spec assertions are added in the codegen phase.)
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

/** Create a ticketing agent row for a user at a given tier; returns its id. */
async function makeAgent(userId: number, accessTier: string, supportRole = "agent"): Promise<number> {
    const conn = db.connection("postgres_admin");
    const now = new Date();
    const [row] = await conn
        .table("ticketing_agents")
        .insert({
            tenant_id: TEST_TENANT_ID,
            user_id: userId,
            support_role: supportRole,
            access_tier: accessTier,
            can_reassign: supportRole === "support_admin",
            status: "active",
            created_at: now,
            updated_at: now,
        })
        .returning("id");
    return Number(row.id);
}

async function makeInbox(): Promise<number> {
    const conn = db.connection("postgres_admin");
    const now = new Date();
    const [row] = await conn
        .table("ticketing_inboxes")
        .insert({
            tenant_id: TEST_TENANT_ID,
            name: "Support",
            channel_type: "internal_web",
            is_default: true,
            status: "active",
            created_at: now,
            updated_at: now,
        })
        .returning("id");
    return Number(row.id);
}

/** Seed a shop_customer conversation, optionally assigned to an agent. Returns its id. */
let displaySeq = 5000;
async function makeConversation(inboxId: number, assigneeAgentId: number | null): Promise<number> {
    const conn = db.connection("postgres_admin");
    const now = new Date();
    displaySeq += 1;
    const [identity] = await conn
        .table("ticketing_channel_identities")
        .insert({
            tenant_id: TEST_TENANT_ID,
            inbox_id: inboxId,
            channel_identity: `user:cust-${displaySeq}`,
            attributes: "{}",
            created_at: now,
            updated_at: now,
        })
        .returning("id");
    const [conv] = await conn
        .table("ticketing_conversations")
        .insert({
            tenant_id: TEST_TENANT_ID,
            display_id: displaySeq,
            inbox_id: inboxId,
            channel_identity_id: Number(identity.id),
            context: "shop_customer",
            status: "open",
            priority: "normal",
            assignee_agent_id: assigneeAgentId,
            attributes: "{}",
            last_activity_at: now,
            created_at: now,
            updated_at: now,
        })
        .returning("id");
    return Number(conv.id);
}

test.group("admin tickets — access tier", (group) => {
    group.each.setup(async () => {
        await ensureTestTenant();
        await resetTicketing();
    });

    test("unauthenticated request is rejected", async ({ client }) => {
        const res = await client.get("/api/v1/admin/tickets");
        res.assertStatus(401);
    });

    test("support_admin (tier all) sees every conversation; unassigned_and_own sees only own + unassigned", async ({
        client,
        assert,
    }) => {
        const adminUser = await makeAdmin("ta-admin@calibra.dev");
        const ownUser = await makeAdmin("ta-own@calibra.dev");
        const adminAgentId = await makeAgent(Number(adminUser.id), "all", "support_admin");
        const ownAgentId = await makeAgent(Number(ownUser.id), "unassigned_and_own", "agent");

        const inbox = await makeInbox();
        await makeConversation(inbox, null); // unassigned
        await makeConversation(inbox, ownAgentId); // own (for ownUser)
        await makeConversation(inbox, adminAgentId); // someone else's

        const adminList = await client.get("/api/v1/admin/tickets").withGuard("api").loginAs(adminUser);
        adminList.assertStatus(200);
        adminList.assertAgainstApiSpec();
        assert.equal(adminList.body().meta.total, 3);

        const ownList = await client.get("/api/v1/admin/tickets").withGuard("api").loginAs(ownUser);
        ownList.assertStatus(200);
        assert.equal(ownList.body().meta.total, 2);
    });

    test("an agent can reply and add an internal note; the note is private and internal", async ({ client, assert }) => {
        const adminUser = await makeAdmin("ta-reply@calibra.dev");
        await makeAgent(Number(adminUser.id), "all", "support_admin");
        const inbox = await makeInbox();
        const conversationId = await makeConversation(inbox, null);

        const reply = await client
            .post(`/api/v1/admin/tickets/${conversationId}/messages`)
            .withGuard("api")
            .loginAs(adminUser)
            .json({ body: "Hello, how can I help?" });
        reply.assertStatus(201);
        reply.assertAgainstApiSpec();
        assert.equal(reply.body().data.direction, "outbound");
        assert.isFalse(reply.body().data.private);

        const note = await client
            .post(`/api/v1/admin/tickets/${conversationId}/messages`)
            .withGuard("api")
            .loginAs(adminUser)
            .json({ body: "internal: VIP customer", is_note: true });
        note.assertStatus(201);
        assert.isTrue(note.body().data.private);
        assert.equal(note.body().data.direction, "internal");

        const detail = await client.get(`/api/v1/admin/tickets/${conversationId}`).withGuard("api").loginAs(adminUser);
        detail.assertStatus(200);
        detail.assertAgainstApiSpec();
        assert.isAbove(detail.body().data.messages.length, 1);
    });

    test("status change is reflected on the conversation", async ({ client, assert }) => {
        const adminUser = await makeAdmin("ta-status@calibra.dev");
        await makeAgent(Number(adminUser.id), "all", "support_admin");
        const inbox = await makeInbox();
        const conversationId = await makeConversation(inbox, null);

        const res = await client
            .patch(`/api/v1/admin/tickets/${conversationId}`)
            .withGuard("api")
            .loginAs(adminUser)
            .json({ status: "resolved" });
        res.assertStatus(200);
        res.assertAgainstApiSpec();
        assert.equal(res.body().data.status, "resolved");
    });

    test("creating a whatsapp inbox returns not_available_in_region (R6)", async ({ client, assert }) => {
        const adminUser = await makeAdmin("ta-gate@calibra.dev");
        await makeAgent(Number(adminUser.id), "all", "support_admin");

        const res = await client
            .post("/api/v1/admin/tickets/inboxes")
            .withGuard("api")
            .loginAs(adminUser)
            .json({ name: "WhatsApp", channel_type: "whatsapp" });
        res.assertStatus(422);
        assert.equal(res.body().errors[0].code, "E_NOT_AVAILABLE_IN_REGION");
    });

    test("a support_admin can manage agents + canned responses", async ({ client, assert }) => {
        const adminUser = await makeAdmin("ta-mgr@calibra.dev");
        await makeAgent(Number(adminUser.id), "all", "support_admin");
        const staff = await makeAdmin("ta-staff@calibra.dev");

        const created = await client
            .post("/api/v1/admin/tickets/agents")
            .withGuard("api")
            .loginAs(adminUser)
            .json({ user_id: Number(staff.id), support_role: "agent", access_tier: "unassigned_and_own" });
        created.assertStatus(201);
        created.assertAgainstApiSpec();
        assert.equal(created.body().data.access_tier, "unassigned_and_own");

        const canned = await client
            .post("/api/v1/admin/tickets/canned")
            .withGuard("api")
            .loginAs(adminUser)
            .json({ shortcut: "hi", title: "Greeting", body: "Hello!" });
        canned.assertStatus(201);
        canned.assertAgainstApiSpec();
        assert.equal(canned.body().data.shortcut, "hi");
    });
});
