import type { SchemaTypes } from "@vinejs/vine/types";

/**
 * The communication-channel adapter contract, mirrored 1:1 on the PSP `PaymentAdapter` pattern
 * (`#services/adapters/base_redirect_gateway`): adapters are stateless module-load singletons, the
 * registry keys them by `provider`, and settings (decrypted secrets) are injected at call time —
 * never stored on the adapter. Capabilities are STATIC code, not per-connection DB (R4).
 *
 * An adapter only ever TRANSLATES between the canonical ticketing shapes and a provider's wire
 * format (`normalizeInbound` / `buildOutbound` / `parseDelivery`) plus connection lifecycle
 * (`verifyConnection` / `provisionWebhook` / `fieldsSchema`). It NEVER writes to the database and
 * NEVER broadcasts — the inbound Job and `conversation_service` own all persistence + realtime. So
 * adding a channel is a `register()` call and a class; nothing in the core changes.
 */

/**
 * Static capability matrix advertised by an adapter. The admin UI renders these as badges and the
 * core guards features off them (e.g. refusing an image attachment to a text-only channel). Honest
 * declaration matters even for not-yet-live providers.
 */
export interface CapabilityDescriptor {
    text: boolean;
    image: boolean;
    file: boolean;
    voice: boolean;
    video: boolean;
    location: boolean;
    templates: boolean;
    reactions: boolean;
    read_receipts: boolean;
    typing: boolean;
    /** Whether an agent can reply from the provider's own phone/app (Telegram staff-group bridge, etc.). Phase 2. */
    agent_reply_from_phone: boolean;
}

/** Canonical content type understood by the ticketing core in v1 (audio/video are phase 2). */
export type CanonicalContentType = "text" | "image" | "file";

/**
 * Normalized inbound message produced from a provider payload. The inbound Job upserts a channel
 * identity from `channelIdentity` and persists a message from the rest. `externalEventId` is the
 * provider-side id used for tenant-scoped dedup (R3).
 */
export interface CanonicalInbound {
    /** Stable provider-side event id for dedup (`ticketing_inbound_events.external_event_id`). */
    externalEventId: string;
    /** Sender's address on this channel (internal: `user:<id>`; wa: E.164; tg: chat id). */
    channelIdentity: string;
    displayName?: string;
    contentType: CanonicalContentType;
    body?: string;
    /** Remote URL for an image/file the Job downloads via media storage (phase-2 for real providers). */
    mediaUrl?: string;
    /** Provider's own id for the message (`ticketing_messages.provider_message_id`). */
    providerMessageId?: string;
    /** The raw provider payload, stamped onto `content_attributes` for forensics. */
    raw: unknown;
}

/** Decrypted connection credentials + non-secret public config injected into adapter calls. */
export interface ChannelCredentials {
    secrets: Record<string, unknown>;
    publicConfig: Record<string, unknown>;
}

/** A built outbound HTTP request the send Job executes via `timeoutFetch`. */
export interface ProviderRequest {
    url: string;
    method: "POST" | "GET";
    headers: Record<string, string>;
    body: unknown;
}

/** A normalized delivery-status update parsed from a provider status webhook. */
export interface DeliveryUpdate {
    providerMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    externalEventId?: string;
}

/** Outbound message shape the core hands to `buildOutbound`. */
export interface OutboundMessage {
    channelIdentity: string;
    contentType: CanonicalContentType;
    body?: string;
    mediaUrl?: string;
    credentials: ChannelCredentials;
}

/** Result of a connection verification attempt. */
export interface VerifyConnectionResult {
    ok: boolean;
    error?: string;
}

/** The VineJS schema an adapter advertises for its connect-flow fields (compiled by the connect controller). */
export type ChannelFieldsSchema = SchemaTypes;

/**
 * The adapter contract. `provider` keys the registry; `capabilities` is static. Translation methods
 * are synchronous pure functions; lifecycle methods are async and hit the network via `timeoutFetch`.
 */
export interface ChannelAdapter {
    readonly provider: string;
    readonly capabilities: CapabilityDescriptor;

    normalizeInbound(payload: unknown): CanonicalInbound;
    buildOutbound(message: OutboundMessage): ProviderRequest;
    parseDelivery(payload: unknown): DeliveryUpdate;
    verifyConnection(credentials: ChannelCredentials): Promise<VerifyConnectionResult>;
    provisionWebhook(credentials: ChannelCredentials, callbackUrl: string): Promise<void>;
    fieldsSchema(): ChannelFieldsSchema;
}
