import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine from "@vinejs/vine";

import { ResourceNotFoundException } from "#exceptions/domain_exceptions";
import TicketingConversation from "#models/ticketing_conversation";
import { platformContext } from "#services/ticketing/conversation_context";
import { postMessage, setStatus } from "#services/ticketing/conversation_service";
import { type PlatformTicketsViewQuery, platformTicketsView } from "#table_views/platform/tickets";
import TicketConversationTransformer from "#transformers/ticket_conversation_transformer";
import TicketMessageTransformer from "#transformers/ticket_message_transformer";

const STATUSES = ["open", "pending", "snoozed", "resolved", "closed", "archived"] as const;

const listValidator = platformTicketsView.compileStrict({
    extras: { q: vine.string().trim().maxLength(160).optional() },
});
const messageValidator = vine.compile(vine.object({ body: vine.string().trim().minLength(1) }));
const updateValidator = vine.compile(
    vine.object({
        status: vine.enum(STATUSES).optional(),
        assignee_platform_user_id: vine.number().positive().nullable().optional(),
    }),
);

function admin() {
    return db.connection("postgres_admin");
}

/**
 * Control-plane internal-ticket queue (`/api/v1/platform/tickets`). Global (R1): runs on
 * `postgres_admin` (BYPASSRLS) with EXPLICIT `tenant_id` handling — `conversation_service` always
 * filters by the conversation's own tenant. Audience is the `platform_internal` inbox ONLY; operators
 * are `platform_users`. The platform assignee is a `platform_user` stored on `attributes` (the
 * `assignee_agent_id` FK points at tenant agents and is not used here).
 */
export default class PlatformTicketsController {
    /** GET / — cross-tenant queue of shop ↔ Calibra tickets. */
    async index(ctx: HttpContext) {
        const parsed = (await listValidator.validate(ctx.request.qs())) as PlatformTicketsViewQuery & { q?: string };
        const builder = TicketingConversation.query({ client: admin() }).where("context", "platform_internal").preload("inbox");
        if (parsed.q) {
            builder.whereILike("subject", `%${parsed.q}%`);
        }
        const { data, meta } = await platformTicketsView.run<TicketingConversation>(builder, parsed);
        return { data: data.map((c) => new TicketConversationTransformer(c).toObject()), meta };
    }

    /** GET /:id — one internal ticket with its feed. */
    async show(ctx: HttpContext) {
        const conversation = await this.load(ctx.params.id);
        await conversation.load("messages", (q) => q.orderBy("created_at", "asc"));
        const conv = new TicketConversationTransformer(conversation).toObject();
        return {
            data: { ...conv, messages: conversation.messages.map((m) => new TicketMessageTransformer(m).toObject()) },
        };
    }

    /** POST /:id/messages — a platform operator replies to the shop. */
    async storeMessage(ctx: HttpContext) {
        const operator = ctx.platformUser;
        const conversation = await this.load(ctx.params.id);
        const payload = await messageValidator.validate(ctx.request.body());

        const message = await admin().transaction(async (trx) => {
            const ctxConv = platformContext(trx, BigInt(conversation.tenantId));
            return postMessage(ctxConv, {
                conversationId: Number(conversation.id),
                direction: "outbound",
                author: { kind: "platform_user", id: operator ? Number(operator.id) : null },
                body: payload.body,
            });
        });
        ctx.response.status(201);
        return { data: new TicketMessageTransformer(message).toObject() };
    }

    /** PATCH /:id — status and/or platform-operator assignment. */
    async update(ctx: HttpContext) {
        const operator = ctx.platformUser;
        const conversation = await this.load(ctx.params.id);
        const payload = await updateValidator.validate(ctx.request.body());

        await admin().transaction(async (trx) => {
            const ctxConv = platformContext(trx, BigInt(conversation.tenantId));
            if (payload.status !== undefined) {
                await setStatus(ctxConv, Number(conversation.id), payload.status, {
                    kind: "platform_user",
                    id: operator ? Number(operator.id) : null,
                });
            }
            if (payload.assignee_platform_user_id !== undefined) {
                const attributes = {
                    ...(conversation.attributes ?? {}),
                    platform_assignee_user_id: payload.assignee_platform_user_id,
                };
                await TicketingConversation.query({ client: trx })
                    .where("tenant_id", Number(conversation.tenantId))
                    .where("id", Number(conversation.id))
                    .update({ attributes });
            }
        });

        const fresh = await this.load(ctx.params.id);
        return { data: new TicketConversationTransformer(fresh).toObject() };
    }

    /** Load a platform_internal conversation on the admin connection (cross-tenant by id). */
    private async load(id: unknown): Promise<TicketingConversation> {
        const conversation = await TicketingConversation.query({ client: admin() })
            .where("context", "platform_internal")
            .where("id", Number(id))
            .preload("inbox")
            .first();
        if (!conversation) {
            throw new ResourceNotFoundException("Ticket not found");
        }
        return conversation;
    }
}
