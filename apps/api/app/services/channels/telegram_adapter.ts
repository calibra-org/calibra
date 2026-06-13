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

/** Telegram Bot API default host; overridable to a phase-2 relay via env (R6). */
const DEFAULT_BASE = "https://api.telegram.org";

/** Resolve the egress base, trimming a trailing slash. */
function apiBase(): string {
    return (env.get("TELEGRAM_API_BASE") ?? DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Telegram Bot API adapter — fully coded to the `ChannelAdapter` seam and unit-tested against a fake
 * provider, but NOT live in v1: inbox creation for `telegram` is gated off (R6). The bot token is
 * carried in the URL path (`/bot<token>/…`) per Telegram's API. The staff-group phone-reply bridge
 * (`agent_reply_from_phone`) is phase 2, so it is declared `false` here.
 */
class TelegramAdapter implements ChannelAdapter {
    readonly provider = "telegram";

    readonly capabilities = {
        text: true,
        image: true,
        file: true,
        voice: true,
        video: true,
        location: true,
        templates: false,
        reactions: true,
        read_receipts: false,
        typing: true,
        agent_reply_from_phone: false,
    } as const;

    /** Parse a bot `update` payload into the canonical shape (chat id is the return address). */
    normalizeInbound(payload: unknown): CanonicalInbound {
        const update = (payload ?? {}) as Record<string, unknown>;
        const message = (update.message ?? update.edited_message ?? {}) as Record<string, unknown>;
        const chat = (message.chat ?? {}) as Record<string, unknown>;
        const from = (message.from ?? {}) as Record<string, unknown>;
        const photo = Array.isArray(message.photo) ? (message.photo as Array<Record<string, unknown>>) : [];
        const document = (message.document ?? null) as Record<string, unknown> | null;
        const contentType = photo.length > 0 ? "image" : document ? "file" : "text";
        const displayName = [from.first_name, from.last_name]
            .filter((p) => typeof p === "string")
            .join(" ")
            .trim();

        return {
            externalEventId: String(update.update_id ?? ""),
            channelIdentity: String(chat.id ?? ""),
            displayName: displayName.length > 0 ? displayName : undefined,
            contentType,
            body: typeof message.text === "string" ? message.text : this.caption(message),
            mediaUrl: this.fileId(photo, document),
            providerMessageId: message.message_id !== undefined ? String(message.message_id) : undefined,
            raw: payload,
        };
    }

    /** Build a `sendMessage` request (token in the path). */
    buildOutbound(message: OutboundMessage): ProviderRequest {
        const token = String(message.credentials.secrets.bot_token ?? "");
        return {
            url: `${apiBase()}/bot${token}/sendMessage`,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: {
                chat_id: message.channelIdentity,
                text: message.body ?? "",
            },
        };
    }

    /** Telegram has no delivery-status webhook; nothing to parse. */
    parseDelivery(_payload: unknown): DeliveryUpdate {
        throw new Error("telegram does not emit delivery-status webhooks");
    }

    /** Probe `getMe` to confirm the bot token is valid. */
    async verifyConnection(credentials: ChannelCredentials): Promise<VerifyConnectionResult> {
        const token = String(credentials.secrets.bot_token ?? "");
        if (!token) {
            return { ok: false, error: "missing_bot_token" };
        }
        try {
            const { status, body } = await timeoutFetch(`${apiBase()}/bot${token}/getMe`, {
                method: "GET",
                timeoutMs: 8000,
            });
            const ok = status >= 200 && status < 300 && (body as Record<string, unknown> | null)?.ok === true;
            return ok ? { ok: true } : { ok: false, error: `http_${status}` };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : "verify_failed" };
        }
    }

    /** Register the inbound webhook with a per-tenant secret token (phase-2; needs the relay URL). */
    async provisionWebhook(credentials: ChannelCredentials, callbackUrl: string): Promise<void> {
        const token = String(credentials.secrets.bot_token ?? "");
        const secretToken = String(credentials.secrets.webhook_secret ?? "");
        if (!token || !callbackUrl) {
            return;
        }
        await timeoutFetch(`${apiBase()}/bot${token}/setWebhook`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: callbackUrl, secret_token: secretToken }),
            timeoutMs: 8000,
        });
    }

    fieldsSchema(): ChannelFieldsSchema {
        return vine.object({
            bot_token: vine.string().trim().minLength(1),
            webhook_secret: vine.string().trim().minLength(1),
            bot_username: vine.string().trim().optional(),
        });
    }

    private caption(message: Record<string, unknown>): string | undefined {
        return typeof message.caption === "string" ? message.caption : undefined;
    }

    private fileId(photo: Array<Record<string, unknown>>, document: Record<string, unknown> | null): string | undefined {
        if (photo.length > 0) {
            const largest = photo[photo.length - 1];
            return typeof largest.file_id === "string" ? largest.file_id : undefined;
        }
        if (document && typeof document.file_id === "string") {
            return document.file_id;
        }
        return undefined;
    }
}

export const telegramAdapter = new TelegramAdapter();
