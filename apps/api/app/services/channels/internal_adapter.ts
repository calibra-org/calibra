import vine from "@vinejs/vine";

import type {
    CanonicalInbound,
    ChannelAdapter,
    ChannelFieldsSchema,
    DeliveryUpdate,
    OutboundMessage,
    ProviderRequest,
    VerifyConnectionResult,
} from "#services/channels/channel_adapter";

/**
 * The built-in internal channel — the only adapter LIVE in v1, and the one the control-plane
 * context reuses. It has no credentials and no egress: an internal message is "delivered" simply by
 * writing the `ticketing_messages` row and broadcasting over transmit (`conversation_service` does
 * both). So `buildOutbound` is a no-op that must never be reached, `verifyConnection` is trivially
 * ok, and there is no webhook to provision.
 *
 * `normalizeInbound` exists for the phase-2 storefront-customer path (a customer posting from the
 * web account UI); in v1 internal posts go straight through `conversation_service.postMessage`.
 */
class InternalAdapter implements ChannelAdapter {
    readonly provider = "internal";

    readonly capabilities = {
        text: true,
        image: true,
        file: true,
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
            externalEventId: String(data.event_id ?? data.source_id ?? ""),
            channelIdentity: String(data.channel_identity ?? ""),
            displayName: typeof data.display_name === "string" ? data.display_name : undefined,
            contentType: data.content_type === "image" || data.content_type === "file" ? data.content_type : "text",
            body: typeof data.body === "string" ? data.body : undefined,
            mediaUrl: typeof data.media_url === "string" ? data.media_url : undefined,
            providerMessageId: typeof data.provider_message_id === "string" ? data.provider_message_id : undefined,
            raw: payload,
        };
    }

    buildOutbound(_message: OutboundMessage): ProviderRequest {
        throw new Error("internal channel has no egress — write the message row + broadcast instead");
    }

    parseDelivery(_payload: unknown): DeliveryUpdate {
        throw new Error("internal channel has no delivery webhook");
    }

    async verifyConnection(): Promise<VerifyConnectionResult> {
        return { ok: true };
    }

    async provisionWebhook(): Promise<void> {
        /** No webhook for the internal channel. */
    }

    fieldsSchema(): ChannelFieldsSchema {
        return vine.object({});
    }
}

export const internalAdapter = new InternalAdapter();
