import vine from "@vinejs/vine";

import { timeoutFetch } from "#services/adapters/base_redirect_gateway";
import type {
    CanonicalInbound,
    ChannelAdapter,
    ChannelCredentials,
    ChannelFieldsSchema,
    DeliveryUpdate,
    OutboundMessage,
    ProviderRequest,
    VerifyConnectionResult,
} from "#services/channels/channel_adapter";
import env from "#start/env";

/** WhatsApp Cloud API default host; overridable to a phase-2 relay via env (R6). */
const DEFAULT_BASE = "https://graph.facebook.com/v21.0";

/** Resolve the egress base, trimming a trailing slash. */
function apiBase(): string {
    return (env.get("WHATSAPP_API_BASE") ?? DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * WhatsApp Cloud API adapter — fully coded to the `ChannelAdapter` seam and unit-tested against a
 * fake provider, but NOT live in v1: inbox creation for `whatsapp` is gated off (R6) because there
 * is no reachable relay from Iran yet. Egress goes through `timeoutFetch` to `WHATSAPP_API_BASE`,
 * which can later point at the out-of-country relay without touching this code.
 */
class WhatsappAdapter implements ChannelAdapter {
    readonly provider = "whatsapp";

    readonly capabilities = {
        text: true,
        image: true,
        file: true,
        voice: true,
        video: true,
        location: true,
        templates: true,
        reactions: true,
        read_receipts: true,
        typing: false,
        agent_reply_from_phone: false,
    } as const;

    /** Parse a Meta webhook payload (`entry[].changes[].value.messages[0]`) into the canonical shape. */
    normalizeInbound(payload: unknown): CanonicalInbound {
        const root = (payload ?? {}) as Record<string, unknown>;
        const value = this.firstChangeValue(root);
        const messages = Array.isArray(value.messages) ? (value.messages as Array<Record<string, unknown>>) : [];
        const message = messages[0] ?? {};
        const contacts = Array.isArray(value.contacts) ? (value.contacts as Array<Record<string, unknown>>) : [];
        const profile = (contacts[0]?.profile ?? {}) as Record<string, unknown>;
        const type = String(message.type ?? "text");

        return {
            externalEventId: String(message.id ?? ""),
            channelIdentity: String(message.from ?? ""),
            displayName: typeof profile.name === "string" ? profile.name : undefined,
            contentType: type === "image" ? "image" : type === "document" ? "file" : "text",
            body: this.extractBody(message, type),
            mediaUrl: this.extractMediaId(message, type),
            providerMessageId: typeof message.id === "string" ? message.id : undefined,
            raw: payload,
        };
    }

    /** Build a Cloud API `messages` send request (text in v1; media phase-2). */
    buildOutbound(message: OutboundMessage): ProviderRequest {
        const phoneNumberId = String(message.credentials.publicConfig.phone_number_id ?? "");
        const accessToken = String(message.credentials.secrets.access_token ?? "");
        return {
            url: `${apiBase()}/${phoneNumberId}/messages`,
            method: "POST",
            headers: {
                authorization: `Bearer ${accessToken}`,
                "content-type": "application/json",
            },
            body: {
                messaging_product: "whatsapp",
                to: message.channelIdentity,
                type: "text",
                text: { body: message.body ?? "" },
            },
        };
    }

    /** Parse a `statuses[]` delivery webhook into a monotonic status update. */
    parseDelivery(payload: unknown): DeliveryUpdate {
        const value = this.firstChangeValue((payload ?? {}) as Record<string, unknown>);
        const statuses = Array.isArray(value.statuses) ? (value.statuses as Array<Record<string, unknown>>) : [];
        const status = statuses[0] ?? {};
        const raw = String(status.status ?? "sent");
        const mapped = raw === "delivered" ? "delivered" : raw === "read" ? "read" : raw === "failed" ? "failed" : "sent";
        return {
            providerMessageId: String(status.id ?? ""),
            status: mapped,
            externalEventId: typeof status.id === "string" ? `status:${status.id}:${raw}` : undefined,
        };
    }

    /** Probe the phone-number node to confirm the access token + id resolve. */
    async verifyConnection(credentials: ChannelCredentials): Promise<VerifyConnectionResult> {
        const phoneNumberId = String(credentials.publicConfig.phone_number_id ?? "");
        const accessToken = String(credentials.secrets.access_token ?? "");
        if (!phoneNumberId || !accessToken) {
            return { ok: false, error: "missing_phone_number_id_or_access_token" };
        }
        try {
            const { status } = await timeoutFetch(`${apiBase()}/${phoneNumberId}`, {
                method: "GET",
                headers: { authorization: `Bearer ${accessToken}` },
                timeoutMs: 8000,
            });
            return status >= 200 && status < 300 ? { ok: true } : { ok: false, error: `http_${status}` };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : "verify_failed" };
        }
    }

    /** Subscribe the app to the WABA's webhooks (phase-2; needs the relay callback URL). */
    async provisionWebhook(credentials: ChannelCredentials, _callbackUrl: string): Promise<void> {
        const wabaId = String(credentials.publicConfig.waba_id ?? "");
        const accessToken = String(credentials.secrets.access_token ?? "");
        if (!wabaId || !accessToken) {
            return;
        }
        await timeoutFetch(`${apiBase()}/${wabaId}/subscribed_apps`, {
            method: "POST",
            headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
            body: JSON.stringify({}),
            timeoutMs: 8000,
        });
    }

    fieldsSchema(): ChannelFieldsSchema {
        return vine.object({
            access_token: vine.string().trim().minLength(1),
            phone_number_id: vine.string().trim().minLength(1),
            app_secret: vine.string().trim().minLength(1),
            waba_id: vine.string().trim().optional(),
        });
    }

    /** Drill into the Meta envelope to the first `changes[].value` object. */
    private firstChangeValue(root: Record<string, unknown>): Record<string, unknown> {
        const entries = Array.isArray(root.entry) ? (root.entry as Array<Record<string, unknown>>) : [];
        const changes = Array.isArray(entries[0]?.changes) ? (entries[0].changes as Array<Record<string, unknown>>) : [];
        return (changes[0]?.value ?? {}) as Record<string, unknown>;
    }

    private extractBody(message: Record<string, unknown>, type: string): string | undefined {
        if (type === "text") {
            const text = (message.text ?? {}) as Record<string, unknown>;
            return typeof text.body === "string" ? text.body : undefined;
        }
        const media = (message[type] ?? {}) as Record<string, unknown>;
        return typeof media.caption === "string" ? media.caption : undefined;
    }

    private extractMediaId(message: Record<string, unknown>, type: string): string | undefined {
        if (type === "image" || type === "document") {
            const media = (message[type] ?? {}) as Record<string, unknown>;
            return typeof media.id === "string" ? media.id : undefined;
        }
        return undefined;
    }
}

export const whatsappAdapter = new WhatsappAdapter();
