import type { HttpContext } from "@adonisjs/core/http";
import type { ModelQueryBuilderContract } from "@adonisjs/lucid/types/model";
import vine from "@vinejs/vine";
import { DateTime } from "luxon";

import { BusinessRuleException, ResourceNotFoundException } from "#exceptions/domain_exceptions";
import TicketingConversation from "#models/ticketing_conversation";
import TicketingInbox from "#models/ticketing_inbox";
import { applyAgentScope } from "#services/ticketing/agent_access";
import { shopContext } from "#services/ticketing/conversation_context";
import { addTag, assign, postMessage, removeTag, setPriority, setStatus, snooze } from "#services/ticketing/conversation_service";
import { resolveShopAgent } from "#services/ticketing/support_actor";
import { type AdminTicketsViewQuery, adminTicketsView } from "#table_views/admin/tickets";
import TicketConversationTransformer from "#transformers/ticket_conversation_transformer";
import TicketMessageTransformer from "#transformers/ticket_message_transformer";

const STATUSES = ["open", "pending", "snoozed", "resolved", "closed", "archived"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const EXTERNAL_CHANNELS = ["whatsapp", "telegram"];

const listValidator = adminTicketsView.compileStrict({
    extras: {
        q: vine.string().trim().maxLength(160).optional(),
        tab: vine.enum([...STATUSES, "all"]).optional(),
    },
});

const messageValidator = vine.compile(
    vine.object({
        body: vine.string().trim().optional(),
        is_note: vine.boolean().optional(),
        content_type: vine.enum(["text", "image", "file"]).optional(),
        attachment_media_ids: vine.array(vine.number().positive()).optional(),
    }),
);

const updateValidator = vine.compile(
    vine.object({
        status: vine.enum(STATUSES).optional(),
        priority: vine.enum(PRIORITIES).optional(),
        assignee_agent_id: vine.number().positive().nullable().optional(),
        snoozed_until: vine.string().optional(),
    }),
);

const tagValidator = vine.compile(vine.object({ tag_id: vine.number().positive() }));

const inboxValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1),
        channel_type: vine.enum(["internal_web", "internal_platform", "whatsapp", "telegram"]),
    }),
);

/**
 * Shop agent inbox (`/api/v1/admin/tickets`). Tenant-scoped on `calibra_app` (RLS) with the
 * access-tier predicate (R5) applied to EVERY list/detail/mutation. Conversations here are the
 * `shop_customer` audience; the shop ↔ Calibra (`platform_internal`) audience lives under
 * `/api/v1/admin/support`.
 */
export default class AdminTicketsController {
    /** GET / — access-tier-scoped inbox list with status tabs, facets, and free-text search. */
    async index(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        const parsed = (await listValidator.validate(ctx.request.qs())) as AdminTicketsViewQuery & {
            q?: string;
            tab?: string;
        };

        const builder = TicketingConversation.query()
            .where("context", "shop_customer")
            .preload("inbox")
            .preload("channelIdentity")
            .preload("conversationTags", (q) => q.preload("tag"));

        if (parsed.tab && parsed.tab !== "all") {
            builder.where("status", parsed.tab);
        }
        if (parsed.q) {
            builder.whereILike("subject", `%${parsed.q}%`);
        }
        applyAgentScope(builder, actor.scope);

        const { data, meta } = await adminTicketsView.run<TicketingConversation>(builder, parsed);
        return { data: data.map((c) => new TicketConversationTransformer(c).toObject()), meta };
    }

    /** GET /:id — the conversation with its full threaded feed. */
    async show(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        const conversation = await this.loadInScope(actor, ctx.params.id, (q) =>
            q
                .preload("inbox")
                .preload("channelIdentity")
                .preload("conversationTags", (t) => t.preload("tag")),
        );
        await conversation.load("messages", (q) =>
            q.orderBy("created_at", "asc").preload("attachments", (a) => a.preload("media")),
        );
        const conv = new TicketConversationTransformer(conversation).toObject();
        return {
            data: {
                ...conv,
                messages: conversation.messages.map((m) => new TicketMessageTransformer(m).toObject()),
            },
        };
    }

    /** POST /:id/messages — post a public reply or an internal note (with optional attachments). */
    async storeMessage(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        const conversation = await this.loadInScope(actor, ctx.params.id);
        const payload = await messageValidator.validate(ctx.request.body());
        if (!payload.body && (payload.attachment_media_ids ?? []).length === 0) {
            throw new BusinessRuleException("A message needs a body or an attachment", "ticketing.message.empty");
        }

        const ctxConv = shopContext("shop_customer");
        const isNote = payload.is_note === true;
        const message = await postMessage(ctxConv, {
            conversationId: Number(conversation.id),
            kind: isNote ? "note" : "message",
            direction: isNote ? "internal" : "outbound",
            contentType: payload.content_type ?? "text",
            body: payload.body ?? null,
            private: isNote,
            author: { kind: "user", id: actor.userId },
            attachmentMediaIds: payload.attachment_media_ids ?? [],
        });
        await message.load("attachments", (a) => a.preload("media"));
        ctx.response.status(201);
        return { data: new TicketMessageTransformer(message).toObject() };
    }

    /** PATCH /:id — status / priority / assignee / snooze (settle-then-persist friendly). */
    async update(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        const conversation = await this.loadInScope(actor, ctx.params.id);
        const payload = await updateValidator.validate(ctx.request.body());
        const ctxConv = shopContext("shop_customer");
        const author = { kind: "user" as const, id: actor.userId };
        const id = Number(conversation.id);

        if (payload.assignee_agent_id !== undefined) {
            if (actor.supportRole !== "support_admin" && !actor.canReassign) {
                throw new BusinessRuleException("You cannot reassign conversations", "ticketing.reassign.forbidden");
            }
            await assign(ctxConv, id, payload.assignee_agent_id, author);
        }
        if (payload.priority !== undefined) {
            await setPriority(ctxConv, id, payload.priority);
        }
        if (payload.snoozed_until !== undefined) {
            await snooze(ctxConv, id, DateTime.fromISO(payload.snoozed_until), author);
        } else if (payload.status !== undefined) {
            await setStatus(ctxConv, id, payload.status, author);
        }

        const fresh = await this.loadInScope(actor, ctx.params.id, (q) =>
            q
                .preload("inbox")
                .preload("channelIdentity")
                .preload("conversationTags", (t) => t.preload("tag")),
        );
        return { data: new TicketConversationTransformer(fresh).toObject() };
    }

    /** POST /:id/tags — attach a tag. */
    async addTag(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        const conversation = await this.loadInScope(actor, ctx.params.id);
        const payload = await tagValidator.validate(ctx.request.body());
        await addTag(shopContext("shop_customer"), Number(conversation.id), payload.tag_id);
        return { data: { ok: true } };
    }

    /** DELETE /:id/tags/:tagId — detach a tag. */
    async removeTag(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        const conversation = await this.loadInScope(actor, ctx.params.id);
        await removeTag(shopContext("shop_customer"), Number(conversation.id), Number(ctx.params.tagId));
        return ctx.response.noContent();
    }

    /** GET /inboxes — list the tenant's inboxes. */
    async inboxes(ctx: HttpContext) {
        await resolveShopAgent(ctx);
        const inboxes = await TicketingInbox.query().orderBy("id", "asc");
        return {
            data: inboxes.map((i) => ({
                id: String(i.id),
                name: i.name,
                channel_type: i.channelType,
                is_default: i.isDefault,
                status: i.status,
            })),
        };
    }

    /** POST /inboxes — create an internal inbox; external (wa/tg) creation is gated off in v1 (R6). */
    async storeInbox(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        if (actor.supportRole !== "support_admin") {
            throw new BusinessRuleException("Only a support admin can create inboxes", "ticketing.inbox.forbidden");
        }
        const payload = await inboxValidator.validate(ctx.request.body());
        if (EXTERNAL_CHANNELS.includes(payload.channel_type)) {
            return ctx.response.status(422).json({
                errors: [
                    {
                        message: ctx.i18n.t("ticketing.not_available_in_region", {}, "Not available in your region yet"),
                        code: "E_NOT_AVAILABLE_IN_REGION",
                    },
                ],
            });
        }
        const inbox = new TicketingInbox();
        inbox.name = payload.name;
        inbox.channelType = payload.channel_type;
        inbox.status = "active";
        inbox.isDefault = false;
        await inbox.save();
        ctx.response.status(201);
        return { data: { id: String(inbox.id), name: inbox.name, channel_type: inbox.channelType } };
    }

    /** Load a conversation within the tenant + the caller's access tier, 404 if out of scope. */
    private async loadInScope(
        actor: Awaited<ReturnType<typeof resolveShopAgent>>,
        id: unknown,
        preload?: (q: ModelQueryBuilderContract<typeof TicketingConversation>) => void,
    ): Promise<TicketingConversation> {
        const numeric = Number(id);
        if (!Number.isFinite(numeric)) {
            throw new ResourceNotFoundException("Conversation not found");
        }
        const query = TicketingConversation.query().where("context", "shop_customer").where("id", numeric);
        applyAgentScope(query, actor.scope);
        if (preload) {
            preload(query);
        }
        const conversation = await query.first();
        if (!conversation) {
            throw new ResourceNotFoundException("Conversation not found");
        }
        return conversation;
    }
}
