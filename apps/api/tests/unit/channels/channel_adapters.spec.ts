import encryption from "@adonisjs/core/services/encryption";
import { test } from "@japa/runner";

import type {
    CanonicalInbound,
    ChannelAdapter,
    ChannelCredentials,
    ChannelFieldsSchema,
    DeliveryUpdate,
    OutboundMessage,
    ProviderRequest,
} from "#services/channels/channel_adapter";
import { ChannelAdapterRegistry, channelAdapterRegistry } from "#services/channels/channel_adapter_registry";
import { mask } from "#services/channels/channel_credential_store";
import { internalAdapter } from "#services/channels/internal_adapter";
import { telegramAdapter } from "#services/channels/telegram_adapter";
import { whatsappAdapter } from "#services/channels/whatsapp_adapter";

/** A throwaway adapter proving the contract: registering one adds a channel with no core change. */
class FakeAdapter implements ChannelAdapter {
    readonly provider = "fake";
    readonly capabilities = {
        text: true,
        image: false,
        file: false,
        voice: false,
        video: false,
        location: false,
        templates: false,
        reactions: false,
        read_receipts: false,
        typing: false,
        agent_reply_from_phone: false,
    } as const;

    normalizeInbound(payload: unknown): CanonicalInbound {
        const data = (payload ?? {}) as Record<string, unknown>;
        return {
            externalEventId: String(data.id ?? ""),
            channelIdentity: String(data.from ?? ""),
            contentType: "text",
            body: typeof data.text === "string" ? data.text : undefined,
            raw: payload,
        };
    }

    buildOutbound(message: OutboundMessage): ProviderRequest {
        return { url: "https://fake.test/send", method: "POST", headers: {}, body: { to: message.channelIdentity } };
    }

    parseDelivery(): DeliveryUpdate {
        return { providerMessageId: "x", status: "sent" };
    }

    async verifyConnection(_credentials: ChannelCredentials) {
        return { ok: true };
    }

    async provisionWebhook() {}

    fieldsSchema(): ChannelFieldsSchema {
        return whatsappAdapter.fieldsSchema();
    }
}

test.group("channels.registry", () => {
    test("register + get + has resolve a fake adapter", ({ assert }) => {
        const registry = new ChannelAdapterRegistry();
        const fake = new FakeAdapter();
        registry.register(fake);
        assert.isTrue(registry.has("fake"));
        assert.strictEqual(registry.get("fake"), fake);
    });

    test("get throws for an unregistered provider", ({ assert }) => {
        const registry = new ChannelAdapterRegistry();
        assert.throws(() => registry.get("nope"), /No channel adapter registered/);
    });

    test("the module-load registry has internal + whatsapp + telegram", ({ assert }) => {
        assert.isTrue(channelAdapterRegistry.has("internal"));
        assert.isTrue(channelAdapterRegistry.has("whatsapp"));
        assert.isTrue(channelAdapterRegistry.has("telegram"));
    });
});

test.group("channels.internal", () => {
    test("capabilities are text/image/file only, no egress, no phone-reply", ({ assert }) => {
        assert.isTrue(internalAdapter.capabilities.text);
        assert.isTrue(internalAdapter.capabilities.image);
        assert.isTrue(internalAdapter.capabilities.file);
        assert.isFalse(internalAdapter.capabilities.voice);
        assert.isFalse(internalAdapter.capabilities.video);
        assert.isFalse(internalAdapter.capabilities.agent_reply_from_phone);
    });

    test("buildOutbound throws — internal delivery is row-write + broadcast", ({ assert }) => {
        assert.throws(
            () =>
                internalAdapter.buildOutbound({
                    channelIdentity: "user:1",
                    contentType: "text",
                    body: "hi",
                    credentials: { secrets: {}, publicConfig: {} },
                }),
            /no egress/,
        );
    });

    test("verifyConnection is trivially ok", async ({ assert }) => {
        assert.deepEqual(await internalAdapter.verifyConnection(), { ok: true });
    });

    test("normalizeInbound maps a simple internal payload", ({ assert }) => {
        const out = internalAdapter.normalizeInbound({
            event_id: "e1",
            channel_identity: "user:42",
            content_type: "text",
            body: "hello",
        });
        assert.equal(out.externalEventId, "e1");
        assert.equal(out.channelIdentity, "user:42");
        assert.equal(out.body, "hello");
    });
});

test.group("channels.whatsapp", () => {
    test("normalizeInbound extracts wamid, sender, and text from a Meta payload", ({ assert }) => {
        const payload = {
            entry: [
                {
                    changes: [
                        {
                            value: {
                                contacts: [{ profile: { name: "Sara" } }],
                                messages: [{ id: "wamid.ABC", from: "989121234567", type: "text", text: { body: "salam" } }],
                            },
                        },
                    ],
                },
            ],
        };
        const out = whatsappAdapter.normalizeInbound(payload);
        assert.equal(out.externalEventId, "wamid.ABC");
        assert.equal(out.channelIdentity, "989121234567");
        assert.equal(out.displayName, "Sara");
        assert.equal(out.contentType, "text");
        assert.equal(out.body, "salam");
        assert.equal(out.providerMessageId, "wamid.ABC");
    });

    test("buildOutbound targets the phone-number node with a bearer token", ({ assert }) => {
        const req = whatsappAdapter.buildOutbound({
            channelIdentity: "989121234567",
            contentType: "text",
            body: "reply",
            credentials: { secrets: { access_token: "tok" }, publicConfig: { phone_number_id: "PN1" } },
        });
        assert.match(req.url, /\/PN1\/messages$/);
        assert.equal(req.method, "POST");
        assert.equal(req.headers.authorization, "Bearer tok");
        assert.deepInclude(req.body as object, { messaging_product: "whatsapp", to: "989121234567" });
    });

    test("parseDelivery maps a statuses[] webhook to a monotonic status", ({ assert }) => {
        const out = whatsappAdapter.parseDelivery({
            entry: [{ changes: [{ value: { statuses: [{ id: "wamid.ABC", status: "read" }] } }] }],
        });
        assert.equal(out.providerMessageId, "wamid.ABC");
        assert.equal(out.status, "read");
    });

    test("verifyConnection fails fast without credentials", async ({ assert }) => {
        const res = await whatsappAdapter.verifyConnection({ secrets: {}, publicConfig: {} });
        assert.isFalse(res.ok);
        assert.equal(res.error, "missing_phone_number_id_or_access_token");
    });
});

test.group("channels.telegram", () => {
    test("normalizeInbound extracts chat id, name, and text from an update", ({ assert }) => {
        const out = telegramAdapter.normalizeInbound({
            update_id: 555,
            message: { message_id: 9, chat: { id: 12345 }, from: { first_name: "Ali" }, text: "hi" },
        });
        assert.equal(out.externalEventId, "555");
        assert.equal(out.channelIdentity, "12345");
        assert.equal(out.displayName, "Ali");
        assert.equal(out.body, "hi");
        assert.equal(out.providerMessageId, "9");
    });

    test("buildOutbound puts the token in the path and chat_id in the body", ({ assert }) => {
        const req = telegramAdapter.buildOutbound({
            channelIdentity: "12345",
            contentType: "text",
            body: "reply",
            credentials: { secrets: { bot_token: "BOT:TKN" }, publicConfig: {} },
        });
        assert.match(req.url, /\/botBOT:TKN\/sendMessage$/);
        assert.deepInclude(req.body as object, { chat_id: "12345", text: "reply" });
    });

    test("verifyConnection fails fast without a bot token", async ({ assert }) => {
        const res = await telegramAdapter.verifyConnection({ secrets: {}, publicConfig: {} });
        assert.isFalse(res.ok);
        assert.equal(res.error, "missing_bot_token");
    });
});

test.group("channels.credential_store", () => {
    test("secrets round-trip through the ChaCha20 service", ({ assert }) => {
        const secrets = { access_token: "super-secret", phone_number_id: "PN1" };
        const ciphertext = encryption.encrypt(secrets, undefined, "channel_secret");
        assert.notInclude(ciphertext, "super-secret");
        const decoded = encryption.decrypt<typeof secrets>(ciphertext, "channel_secret");
        assert.deepEqual(decoded, secrets);
    });

    test("decrypt with the wrong purpose returns null (no cross-purpose leak)", ({ assert }) => {
        const ciphertext = encryption.encrypt({ a: 1 }, undefined, "channel_secret");
        assert.isNull(encryption.decrypt(ciphertext, "some_other_purpose"));
    });

    test("mask projects a connection to its secret-free public view", ({ assert }) => {
        const masked = mask({
            id: 7,
            provider: "whatsapp",
            provider_variant: "cloud_api",
            endpoint_id: "ep_abc",
            status: "connected",
            public_config: { phone_number_id: "PN1" },
            key_version: 1,
            last_verified_at: null,
            last_error: null,
        });
        assert.equal(masked.provider, "whatsapp");
        assert.equal(masked.endpoint_id, "ep_abc");
        assert.deepEqual(masked.public_config, { phone_number_id: "PN1" });
        assert.notProperty(masked, "ciphertext");
        assert.notProperty(masked, "access_token");
    });
});
