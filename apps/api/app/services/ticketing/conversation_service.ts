import transmit from "@adonisjs/transmit/services/main";
import { DateTime } from "luxon";

import TicketingAttachment from "#models/ticketing_attachment";
import TicketingCannedResponse from "#models/ticketing_canned_response";
import TicketingChannelIdentity from "#models/ticketing_channel_identity";
import TicketingConversation from "#models/ticketing_conversation";
import TicketingConversationParticipant from "#models/ticketing_conversation_participant";
import TicketingConversationTag from "#models/ticketing_conversation_tag";
import TicketingMessage from "#models/ticketing_message";
import { nextNumber } from "#services/tenant_numbering_service";
import type { ConversationContext } from "#services/ticketing/conversation_context";

/**
 * The shared conversation/message core (R5). Every method takes a {@link ConversationContext} and
 * rides `ctx.trx` with an explicit `tenant_id` filter, so the identical logic serves the shop agent
 * inbox (RLS), the shop-admin → Calibra surface (RLS), and the control-plane queue (BYPASSRLS +
 * explicit tenant). Channel adapters never touch the DB; this service owns every write + the
 * transmit broadcast (R4). Realtime events go out on `ticketing/conversations/:id`.
 */

/** Author of a posted message. */
export interface MessageAuthor {
    kind: "customer" | "user" | "platform_user" | "system";
    id: number | null;
}

export interface PostMessageInput {
    conversationId: number;
    kind?: "message" | "note" | "activity" | "template";
    contentType?: "text" | "image" | "file";
    body?: string | null;
    direction: "inbound" | "outbound" | "internal";
    author: MessageAuthor;
    private?: boolean;
    attachmentMediaIds?: number[];
    providerMessageId?: string | null;
    sourceId?: string | null;
    contentAttributes?: Record<string, unknown>;
}

export interface FindOrCreateInput {
    inboxId: number;
    channelIdentity: string;
    customerId?: number | null;
    userId?: number | null;
    displayName?: string | null;
    subject?: string | null;
}

/** Statuses that keep a conversation "live" and therefore reusable for a new inbound message. */
const LIVE_STATUSES = ["open", "pending", "snoozed"];

/** Broadcast a ticketing event to the conversation's SSE channel. Subscribers are authorized per R5. */
function broadcast(conversationId: number, event: Record<string, unknown>): void {
    transmit.broadcast(`ticketing/conversations/${conversationId}`, event as never);
}

/**
 * Find a live conversation for an (inbox, channel identity) pair or create a new one, upserting the
 * channel identity first. New conversations draw a per-tenant `display_id` from the numbering service
 * and register the requester as a participant. Must run inside a tenant context (numbering needs it).
 */
export async function findOrCreateConversation(
    ctx: ConversationContext,
    input: FindOrCreateInput,
): Promise<TicketingConversation> {
    const tenantId = Number(ctx.tenantId);

    let identity = await TicketingChannelIdentity.query({ client: ctx.trx })
        .where("tenant_id", tenantId)
        .where("inbox_id", input.inboxId)
        .where("channel_identity", input.channelIdentity)
        .first();

    if (!identity) {
        identity = new TicketingChannelIdentity();
        identity.tenantId = tenantId;
        identity.inboxId = input.inboxId;
        identity.channelIdentity = input.channelIdentity;
        identity.customerId = input.customerId ?? null;
        identity.userId = input.userId ?? null;
        identity.displayName = input.displayName ?? null;
        identity.attributes = {};
        identity.useTransaction(ctx.trx);
        await identity.save();
    } else if (input.displayName && identity.displayName !== input.displayName) {
        identity.displayName = input.displayName;
        identity.useTransaction(ctx.trx);
        await identity.save();
    }

    const existing = await TicketingConversation.query({ client: ctx.trx })
        .where("tenant_id", tenantId)
        .where("inbox_id", input.inboxId)
        .where("channel_identity_id", Number(identity.id))
        .whereIn("status", LIVE_STATUSES)
        .orderBy("id", "desc")
        .first();

    if (existing) {
        return existing;
    }

    const displayId = await nextNumber("conversation");
    const conversation = new TicketingConversation();
    conversation.tenantId = tenantId;
    conversation.displayId = displayId;
    conversation.inboxId = input.inboxId;
    conversation.channelIdentityId = Number(identity.id);
    conversation.context = ctx.contextValue;
    conversation.subject = input.subject ?? null;
    conversation.status = "open";
    conversation.priority = "normal";
    conversation.lastActivityAt = DateTime.utc();
    conversation.attributes = {};
    conversation.useTransaction(ctx.trx);
    await conversation.save();

    await registerParticipant(ctx, Number(conversation.id), {
        kind: input.customerId ? "customer" : "user",
        id: input.customerId ?? input.userId ?? null,
        role: "requester",
    });

    return conversation;
}

/**
 * Insert a message (reply / internal note / activity / template) + attachments, advance the
 * conversation's activity/first-response/waiting clocks, broadcast `message.created`, and return the
 * message with its attachments preloaded.
 */
export async function postMessage(ctx: ConversationContext, input: PostMessageInput): Promise<TicketingMessage> {
    const tenantId = Number(ctx.tenantId);
    const conversation = await loadConversation(ctx, input.conversationId);

    const message = new TicketingMessage();
    message.tenantId = tenantId;
    message.conversationId = input.conversationId;
    message.inboxId = Number(conversation.inboxId);
    message.direction = input.direction;
    message.kind = input.kind ?? "message";
    message.contentType = input.contentType ?? "text";
    message.body = input.body ?? null;
    message.contentAttributes = input.contentAttributes ?? {};
    message.authorKind = input.author.kind;
    message.authorId = input.author.id;
    message.private = input.private ?? false;
    message.status = "sent";
    message.providerMessageId = input.providerMessageId ?? null;
    message.sourceId = input.sourceId ?? null;
    message.useTransaction(ctx.trx);
    await message.save();

    for (const mediaId of input.attachmentMediaIds ?? []) {
        const attachment = new TicketingAttachment();
        attachment.tenantId = tenantId;
        attachment.messageId = Number(message.id);
        attachment.mediaId = mediaId;
        attachment.useTransaction(ctx.trx);
        await attachment.save();
    }

    const now = DateTime.utc();
    conversation.lastActivityAt = now;
    if (input.direction === "outbound" && message.kind === "message" && conversation.firstResponseAt === null) {
        conversation.firstResponseAt = now;
    }
    if (input.direction === "inbound") {
        conversation.waitingSince = conversation.waitingSince ?? now;
    } else if (input.direction === "outbound") {
        conversation.waitingSince = null;
    }
    conversation.useTransaction(ctx.trx);
    await conversation.save();

    if ((input.attachmentMediaIds ?? []).length > 0) {
        await message.load("attachments");
    }

    broadcast(input.conversationId, {
        type: "message.created",
        conversation_id: input.conversationId,
        message_id: Number(message.id),
        direction: message.direction,
        private: message.private,
    });

    return message;
}

/** Change conversation status, log a system activity entry, and broadcast `status.changed`. */
export async function setStatus(
    ctx: ConversationContext,
    conversationId: number,
    status: string,
    actor: MessageAuthor,
): Promise<TicketingConversation> {
    const conversation = await loadConversation(ctx, conversationId);
    if (conversation.status === status) {
        return conversation;
    }
    const previous = conversation.status;
    conversation.status = status;
    if (status !== "snoozed") {
        conversation.snoozedUntil = null;
    }
    conversation.lastActivityAt = DateTime.utc();
    conversation.useTransaction(ctx.trx);
    await conversation.save();

    await logActivity(ctx, conversationId, actor, `status:${previous}->${status}`);
    broadcast(conversationId, { type: "status.changed", conversation_id: conversationId, status });
    return conversation;
}

/** Set conversation priority and broadcast. */
export async function setPriority(
    ctx: ConversationContext,
    conversationId: number,
    priority: string,
): Promise<TicketingConversation> {
    const conversation = await loadConversation(ctx, conversationId);
    if (conversation.priority === priority) {
        return conversation;
    }
    conversation.priority = priority;
    conversation.lastActivityAt = DateTime.utc();
    conversation.useTransaction(ctx.trx);
    await conversation.save();
    broadcast(conversationId, { type: "priority.changed", conversation_id: conversationId, priority });
    return conversation;
}

/** Assign (or unassign with null) a conversation, log activity, and broadcast `assignment.changed`. */
export async function assign(
    ctx: ConversationContext,
    conversationId: number,
    agentId: number | null,
    actor: MessageAuthor,
): Promise<TicketingConversation> {
    const conversation = await loadConversation(ctx, conversationId);
    if (Number(conversation.assigneeAgentId ?? 0) === Number(agentId ?? 0)) {
        return conversation;
    }
    conversation.assigneeAgentId = agentId;
    conversation.lastActivityAt = DateTime.utc();
    conversation.useTransaction(ctx.trx);
    await conversation.save();

    await logActivity(ctx, conversationId, actor, agentId ? `assigned:${agentId}` : "unassigned");
    broadcast(conversationId, { type: "assignment.changed", conversation_id: conversationId, assignee_agent_id: agentId });
    return conversation;
}

/** Snooze a conversation until a future time (status → snoozed) and broadcast. */
export async function snooze(
    ctx: ConversationContext,
    conversationId: number,
    until: DateTime,
    actor: MessageAuthor,
): Promise<TicketingConversation> {
    const conversation = await loadConversation(ctx, conversationId);
    conversation.status = "snoozed";
    conversation.snoozedUntil = until;
    conversation.lastActivityAt = DateTime.utc();
    conversation.useTransaction(ctx.trx);
    await conversation.save();
    await logActivity(ctx, conversationId, actor, "snoozed");
    broadcast(conversationId, { type: "status.changed", conversation_id: conversationId, status: "snoozed" });
    return conversation;
}

/** Attach a tag to a conversation (idempotent on the unique constraint). */
export async function addTag(ctx: ConversationContext, conversationId: number, tagId: number): Promise<void> {
    const tenantId = Number(ctx.tenantId);
    await ctx.trx
        .table("ticketing_conversation_tags")
        .insert({ tenant_id: tenantId, conversation_id: conversationId, tag_id: tagId, created_at: new Date() })
        .onConflict(["tenant_id", "conversation_id", "tag_id"])
        .ignore();
    broadcast(conversationId, { type: "tag.added", conversation_id: conversationId, tag_id: tagId });
}

/** Detach a tag from a conversation. */
export async function removeTag(ctx: ConversationContext, conversationId: number, tagId: number): Promise<void> {
    await TicketingConversationTag.query({ client: ctx.trx })
        .where("tenant_id", Number(ctx.tenantId))
        .where("conversation_id", conversationId)
        .where("tag_id", tagId)
        .delete();
    broadcast(conversationId, { type: "tag.removed", conversation_id: conversationId, tag_id: tagId });
}

/** Resolve a canned response by shortcut for the composer's `/shortcut` picker. */
export async function resolveCanned(ctx: ConversationContext, shortcut: string): Promise<TicketingCannedResponse | null> {
    return TicketingCannedResponse.query({ client: ctx.trx })
        .where("tenant_id", Number(ctx.tenantId))
        .where("shortcut", shortcut)
        .first();
}

/** Load a conversation within the context's tenant scope, throwing if not found / out of scope. */
async function loadConversation(ctx: ConversationContext, conversationId: number): Promise<TicketingConversation> {
    const conversation = await TicketingConversation.query({ client: ctx.trx })
        .where("tenant_id", Number(ctx.tenantId))
        .where("id", conversationId)
        .first();
    if (!conversation) {
        throw new Error(`conversation ${conversationId} not found in tenant ${ctx.tenantId}`);
    }
    return conversation;
}

/** Register (idempotently) a participant on a conversation. */
async function registerParticipant(
    ctx: ConversationContext,
    conversationId: number,
    participant: { kind: "customer" | "user" | "platform_user"; id: number | null; role: "requester" | "assignee" | "watcher" },
): Promise<void> {
    if (participant.id === null) {
        return;
    }
    const exists = await TicketingConversationParticipant.query({ client: ctx.trx })
        .where("tenant_id", Number(ctx.tenantId))
        .where("conversation_id", conversationId)
        .where("participant_kind", participant.kind)
        .where("participant_id", participant.id)
        .first();
    if (exists) {
        return;
    }
    const row = new TicketingConversationParticipant();
    row.tenantId = Number(ctx.tenantId);
    row.conversationId = conversationId;
    row.participantKind = participant.kind;
    row.participantId = participant.id;
    row.role = participant.role;
    row.useTransaction(ctx.trx);
    await row.save();
}

/** Write a system `activity` message describing a state change (renders in the unified feed). */
async function logActivity(
    ctx: ConversationContext,
    conversationId: number,
    actor: MessageAuthor,
    summary: string,
): Promise<void> {
    const conversation = await loadConversation(ctx, conversationId);
    const message = new TicketingMessage();
    message.tenantId = Number(ctx.tenantId);
    message.conversationId = conversationId;
    message.inboxId = Number(conversation.inboxId);
    message.direction = "internal";
    message.kind = "activity";
    message.contentType = "text";
    message.body = summary;
    message.contentAttributes = { activity: summary };
    message.authorKind = actor.kind;
    message.authorId = actor.id;
    message.private = true;
    message.status = "sent";
    message.useTransaction(ctx.trx);
    await message.save();
}
