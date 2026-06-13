import { createHmac } from "node:crypto";
import encryption from "@adonisjs/core/services/encryption";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { ensureTestTenant, TEST_TENANT_ID } from "#tests/helpers/tenant";

/**
 * The single load-bearing unbuilt piece (R3): the inbound channel webhook seam. WhatsApp/Telegram
 * are not live in v1, so this exercises the seam end-to-end with a SIGNED FAKE WhatsApp payload:
 * tenant resolved from `endpointId` (never Host), Meta HMAC verified against the per-tenant DB
 * secret, deduped on the tenant-scoped ledger, job enqueued (sync driver → inline), message lands in
 * the right tenant's conversation. Also asserts the two cross-cutting invariants: bad signature 401s
 * before the ledger, and two tenants sharing a provider event id do NOT collide.
 */
const SECOND_TENANT_ID = 100001;
const APP_SECRET = "meta-app-secret-xyz";

/** Insert a second full tenant (plan/currency already ensured by ensureTestTenant). */
async function ensureSecondTenant(): Promise<void> {
    const conn = db.connection("postgres_admin");
    const now = DateTime.utc().toSQL()!;
    const plan = await conn.from("plans").where("key", "starter").first();
    await conn
        .table("tenants")
        .insert({
            id: SECOND_TENANT_ID,
            slug: "test2",
            name: "Test Shop 2",
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

/** Create a connected WhatsApp connection + sealed secret + bound inbox for a tenant. */
async function provisionWhatsapp(tenantId: number, endpointId: string): Promise<number> {
    const conn = db.connection("postgres_admin");
    const now = new Date();
    const [connection] = await conn
        .table("channel_connections")
        .insert({
            tenant_id: tenantId,
            provider: "whatsapp",
            endpoint_id: endpointId,
            status: "connected",
            public_config: JSON.stringify({ phone_number_id: "PN1" }),
            key_version: 1,
            created_at: now,
            updated_at: now,
        })
        .returning("id");
    const connectionId = Number(connection.id);

    const ciphertext = encryption.encrypt(
        { app_secret: APP_SECRET, access_token: "tok", phone_number_id: "PN1" },
        undefined,
        "channel_secret",
    );
    await conn
        .table("channel_secrets")
        .insert({ tenant_id: tenantId, connection_id: connectionId, ciphertext, key_version: 1, created_at: now });

    await conn.table("ticketing_inboxes").insert({
        tenant_id: tenantId,
        name: "WhatsApp",
        channel_type: "whatsapp",
        channel_connection_id: connectionId,
        is_default: false,
        status: "active",
        created_at: now,
        updated_at: now,
    });

    return connectionId;
}

/** Build a Meta inbound payload carrying one text message with the given wamid. */
function metaPayload(wamid: string, from: string, body: string): Record<string, unknown> {
    return {
        entry: [
            {
                changes: [
                    {
                        value: {
                            contacts: [{ profile: { name: "Sara" } }],
                            messages: [{ id: wamid, from, type: "text", text: { body } }],
                        },
                    },
                ],
            },
        ],
    };
}

/** Meta HMAC over the exact JSON string the client sends. */
function sign(payload: Record<string, unknown>): { raw: string; signature: string } {
    const raw = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
    return { raw, signature };
}

test.group("ticketing.inbound_webhook", (group) => {
    group.each.setup(async () => {
        await ensureTestTenant();
        await ensureSecondTenant();
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
            "channel_secrets",
            "ticketing_inboxes",
            "channel_connections",
            "ticketing_agents",
        ];
        for (const table of order) {
            await conn.from(table).delete();
        }
    });

    test("a signed fake payload resolves the tenant from endpointId and lands a message", async ({ client, assert }) => {
        await provisionWhatsapp(TEST_TENANT_ID, "ep-tenant-a");
        const payload = metaPayload("wamid.A1", "989121234567", "salam");
        const { signature } = sign(payload);

        const res = await client
            .post("/api/v1/webhooks/channels/whatsapp/ep-tenant-a")
            .header("x-hub-signature-256", signature)
            .json(payload);

        res.assertStatus(200);
        res.assertBodyContains({ status: "accepted" });

        const conn = db.connection("postgres_admin");
        const conversation = await conn.from("ticketing_conversations").where("tenant_id", TEST_TENANT_ID).first();
        assert.isNotNull(conversation);
        assert.equal(conversation.context, "shop_customer");

        const message = await conn
            .from("ticketing_messages")
            .where("tenant_id", TEST_TENANT_ID)
            .where("direction", "inbound")
            .first();
        assert.equal(message.body, "salam");

        const ledger = await conn
            .from("ticketing_inbound_events")
            .where("tenant_id", TEST_TENANT_ID)
            .where("external_event_id", "wamid.A1")
            .first();
        assert.equal(ledger.outcome, "processed");
        assert.equal(Number(ledger.conversation_id), Number(conversation.id));
    });

    test("a replayed event is deduped (200 duplicate, no second conversation)", async ({ client, assert }) => {
        await provisionWhatsapp(TEST_TENANT_ID, "ep-tenant-a");
        const payload = metaPayload("wamid.A1", "989121234567", "salam");
        const { signature } = sign(payload);

        await client
            .post("/api/v1/webhooks/channels/whatsapp/ep-tenant-a")
            .header("x-hub-signature-256", signature)
            .json(payload);
        const replay = await client
            .post("/api/v1/webhooks/channels/whatsapp/ep-tenant-a")
            .header("x-hub-signature-256", signature)
            .json(payload);

        replay.assertStatus(200);
        replay.assertBodyContains({ status: "duplicate" });

        const conn = db.connection("postgres_admin");
        const count = await conn.from("ticketing_conversations").where("tenant_id", TEST_TENANT_ID).count("* as total");
        assert.equal(Number(count[0].total), 1);
    });

    test("a bad signature 401s before the ledger is touched", async ({ client, assert }) => {
        await provisionWhatsapp(TEST_TENANT_ID, "ep-tenant-a");
        const payload = metaPayload("wamid.BAD", "989121234567", "salam");

        const res = await client
            .post("/api/v1/webhooks/channels/whatsapp/ep-tenant-a")
            .header("x-hub-signature-256", "sha256=deadbeef")
            .json(payload);

        res.assertStatus(401);

        const conn = db.connection("postgres_admin");
        const ledger = await conn.from("ticketing_inbound_events").where("external_event_id", "wamid.BAD").first();
        assert.isNotOk(ledger);
    });

    test("an unknown endpoint 404s", async ({ client }) => {
        const payload = metaPayload("wamid.X", "989121234567", "hi");
        const { signature } = sign(payload);
        const res = await client
            .post("/api/v1/webhooks/channels/whatsapp/does-not-exist")
            .header("x-hub-signature-256", signature)
            .json(payload);
        res.assertStatus(404);
    });

    test("two tenants with the SAME provider event id do not collide (R3)", async ({ client, assert }) => {
        await provisionWhatsapp(TEST_TENANT_ID, "ep-tenant-a");
        await provisionWhatsapp(SECOND_TENANT_ID, "ep-tenant-b");
        const payload = metaPayload("wamid.SHARED", "989120000000", "hello both");
        const { signature } = sign(payload);

        const resA = await client
            .post("/api/v1/webhooks/channels/whatsapp/ep-tenant-a")
            .header("x-hub-signature-256", signature)
            .json(payload);
        const resB = await client
            .post("/api/v1/webhooks/channels/whatsapp/ep-tenant-b")
            .header("x-hub-signature-256", signature)
            .json(payload);

        resA.assertStatus(200);
        resA.assertBodyContains({ status: "accepted" });
        resB.assertStatus(200);
        resB.assertBodyContains({ status: "accepted" });

        const conn = db.connection("postgres_admin");
        const ledgerA = await conn
            .from("ticketing_inbound_events")
            .where("tenant_id", TEST_TENANT_ID)
            .where("external_event_id", "wamid.SHARED")
            .first();
        const ledgerB = await conn
            .from("ticketing_inbound_events")
            .where("tenant_id", SECOND_TENANT_ID)
            .where("external_event_id", "wamid.SHARED")
            .first();
        assert.isNotNull(ledgerA);
        assert.isNotNull(ledgerB);
        assert.equal(ledgerA.outcome, "processed");
        assert.equal(ledgerB.outcome, "processed");
    });
});
