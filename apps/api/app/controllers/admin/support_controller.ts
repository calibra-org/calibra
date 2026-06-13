import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import { BusinessRuleException, ResourceNotFoundException } from "#exceptions/domain_exceptions";
import TicketingConversation from "#models/ticketing_conversation";
import TicketingInbox from "#models/ticketing_inbox";
import { canManageSupport } from "#services/ticketing/agent_access";
import { shopContext } from "#services/ticketing/conversation_context";
import { findOrCreateConversation, postMessage } from "#services/ticketing/conversation_service";
import { resolveShopAgent } from "#services/ticketing/support_actor";
import TicketConversationTransformer from "#transformers/ticket_conversation_transformer";
import TicketMessageTransformer from "#transformers/ticket_message_transformer";

const openValidator = vine.compile(
    vine.object({ subject: vine.string().trim().minLength(1).maxLength(200), body: vine.string().trim().minLength(1) }),
);
const messageValidator = vine.compile(vine.object({ body: vine.string().trim().minLength(1) }));

/**
 * Shop-admin → Calibra support (`/api/v1/admin/support`). Same conversation core (R5), the
 * `platform_internal` audience, the tenant's own `internal_platform` inbox. The route is mounted
 * behind `admin` middleware, so only the shop owner/admin reaches it — regular support agents do NOT
 * see the shop's tickets to Calibra (enforced by inbox audience + the admin gate). Platform operators
 * see the other side under `/api/v1/platform/tickets`.
 */
export default class AdminSupportController {
    /**
     * Only the shop owner/support-admin may see or open tickets to Calibra — regular support agents
     * are excluded (DoD). Returns the acting user id.
     */
    private async requireOwner(ctx: HttpContext): Promise<{ userId: number }> {
        const actor = await resolveShopAgent(ctx);
        if (!canManageSupport(actor.supportRole)) {
            throw new BusinessRuleException("Only the shop owner can contact Calibra support", "ticketing.support.owner_only");
        }
        return { userId: actor.userId };
    }

    /** GET / — the shop's own tickets to Calibra. */
    async index(ctx: HttpContext) {
        await this.requireOwner(ctx);
        const conversations = await TicketingConversation.query()
            .where("context", "platform_internal")
            .preload("inbox")
            .orderBy("last_activity_at", "desc");
        return { data: conversations.map((c) => new TicketConversationTransformer(c).toObject()) };
    }

    /** POST / — open a new ticket to Calibra. */
    async store(ctx: HttpContext) {
        const { userId } = await this.requireOwner(ctx);
        const payload = await openValidator.validate(ctx.request.body());
        const inbox = await this.platformInbox();

        const ctxConv = shopContext("platform_internal");
        const conversation = await findOrCreateConversation(ctxConv, {
            inboxId: Number(inbox.id),
            channelIdentity: `user:${userId}`,
            userId,
            subject: payload.subject,
        });
        await postMessage(ctxConv, {
            conversationId: Number(conversation.id),
            direction: "inbound",
            author: { kind: "user", id: userId },
            body: payload.body,
        });
        ctx.response.status(201);
        return { data: new TicketConversationTransformer(conversation).toObject() };
    }

    /** GET /:id — a ticket-to-Calibra with its feed. */
    async show(ctx: HttpContext) {
        await this.requireOwner(ctx);
        const conversation = await this.load(ctx.params.id);
        await conversation.load("messages", (q) => q.orderBy("created_at", "asc"));
        const conv = new TicketConversationTransformer(conversation).toObject();
        return {
            data: { ...conv, messages: conversation.messages.map((m) => new TicketMessageTransformer(m).toObject()) },
        };
    }

    /** POST /:id/messages — reply on a ticket to Calibra. */
    async storeMessage(ctx: HttpContext) {
        const { userId } = await this.requireOwner(ctx);
        const conversation = await this.load(ctx.params.id);
        const payload = await messageValidator.validate(ctx.request.body());
        const message = await postMessage(shopContext("platform_internal"), {
            conversationId: Number(conversation.id),
            direction: "inbound",
            author: { kind: "user", id: userId },
            body: payload.body,
        });
        ctx.response.status(201);
        return { data: new TicketMessageTransformer(message).toObject() };
    }

    /** The tenant's default internal_platform inbox (provisioned per tenant). */
    private async platformInbox(): Promise<TicketingInbox> {
        const inbox = await TicketingInbox.query().where("channel_type", "internal_platform").orderBy("id", "asc").first();
        if (!inbox) {
            throw new BusinessRuleException("No platform support inbox provisioned for this shop", "ticketing.support.no_inbox");
        }
        return inbox;
    }

    private async load(id: unknown): Promise<TicketingConversation> {
        const conversation = await TicketingConversation.query()
            .where("context", "platform_internal")
            .where("id", Number(id))
            .first();
        if (!conversation) {
            throw new ResourceNotFoundException("Ticket not found");
        }
        return conversation;
    }
}
