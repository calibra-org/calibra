import type { HttpContext } from "@adonisjs/core/http";
import vine from "@vinejs/vine";

import { BusinessRuleException, ResourceNotFoundException } from "#exceptions/domain_exceptions";
import TicketingAgent from "#models/ticketing_agent";
import TicketingCannedResponse from "#models/ticketing_canned_response";
import TicketingInboxMember from "#models/ticketing_inbox_member";
import TicketingTag from "#models/ticketing_tag";
import { canManageSupport } from "#services/ticketing/agent_access";
import { resolveShopAgent } from "#services/ticketing/support_actor";
import TicketAgentTransformer from "#transformers/ticket_agent_transformer";

const SUPPORT_ROLES = ["agent", "supervisor", "support_admin"] as const;
const ACCESS_TIERS = ["all", "unassigned_and_own", "participating"] as const;

const agentCreateValidator = vine.compile(
    vine.object({
        user_id: vine.number().positive(),
        support_role: vine.enum(SUPPORT_ROLES),
        access_tier: vine.enum(ACCESS_TIERS),
        can_reassign: vine.boolean().optional(),
        max_open_capacity: vine.number().positive().nullable().optional(),
        inbox_ids: vine.array(vine.number().positive()).optional(),
    }),
);

const agentUpdateValidator = vine.compile(
    vine.object({
        support_role: vine.enum(SUPPORT_ROLES).optional(),
        access_tier: vine.enum(ACCESS_TIERS).optional(),
        can_reassign: vine.boolean().optional(),
        max_open_capacity: vine.number().positive().nullable().optional(),
        status: vine.enum(["active", "disabled"]).optional(),
        inbox_ids: vine.array(vine.number().positive()).optional(),
    }),
);

const cannedValidator = vine.compile(
    vine.object({
        shortcut: vine.string().trim().minLength(1).maxLength(64),
        title: vine.string().trim().minLength(1),
        body: vine.string().trim().minLength(1),
    }),
);
const cannedUpdateValidator = vine.compile(
    vine.object({
        shortcut: vine.string().trim().minLength(1).maxLength(64).optional(),
        title: vine.string().trim().minLength(1).optional(),
        body: vine.string().trim().minLength(1).optional(),
    }),
);

const tagValidator = vine.compile(
    vine.object({ name: vine.string().trim().minLength(1).maxLength(64), color: vine.string().trim().maxLength(16).optional() }),
);

/**
 * Support settings (`/api/v1/admin/tickets/{agents,canned,tags}`). Every endpoint is gated to
 * `support_admin` (R5) via the resolved actor — never trusted from the client. Manages the support
 * roster (role + access tier + inbox membership), canned responses, and tags.
 */
export default class TicketAgentsController {
    /** Assert the caller is a support_admin, returning the resolved actor. */
    private async requireAdmin(ctx: HttpContext) {
        const actor = await resolveShopAgent(ctx);
        if (!canManageSupport(actor.supportRole)) {
            throw new BusinessRuleException("Support admin access required", "ticketing.support_admin.required");
        }
        return actor;
    }

    async agentsIndex(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const agents = await TicketingAgent.query().preload("user").orderBy("id", "asc");
        return { data: agents.map((a) => new TicketAgentTransformer(a).toObject()) };
    }

    async agentsStore(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const payload = await agentCreateValidator.validate(ctx.request.body());
        const agent = new TicketingAgent();
        agent.userId = payload.user_id;
        agent.supportRole = payload.support_role;
        agent.accessTier = payload.access_tier;
        agent.canReassign = payload.can_reassign ?? false;
        agent.maxOpenCapacity = payload.max_open_capacity ?? null;
        agent.status = "active";
        await agent.save();
        await this.syncInboxMembers(Number(agent.id), payload.inbox_ids);
        await agent.load("user");
        ctx.response.status(201);
        return { data: new TicketAgentTransformer(agent).toObject() };
    }

    async agentsUpdate(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const agent = await TicketingAgent.query().where("id", Number(ctx.params.id)).first();
        if (!agent) {
            throw new ResourceNotFoundException("Agent not found");
        }
        const payload = await agentUpdateValidator.validate(ctx.request.body());
        if (payload.support_role !== undefined) agent.supportRole = payload.support_role;
        if (payload.access_tier !== undefined) agent.accessTier = payload.access_tier;
        if (payload.can_reassign !== undefined) agent.canReassign = payload.can_reassign;
        if (payload.max_open_capacity !== undefined) agent.maxOpenCapacity = payload.max_open_capacity;
        if (payload.status !== undefined) agent.status = payload.status;
        await agent.save();
        if (payload.inbox_ids !== undefined) {
            await this.syncInboxMembers(Number(agent.id), payload.inbox_ids);
        }
        await agent.load("user");
        return { data: new TicketAgentTransformer(agent).toObject() };
    }

    async cannedIndex(ctx: HttpContext) {
        await resolveShopAgent(ctx);
        const rows = await TicketingCannedResponse.query().orderBy("shortcut", "asc");
        return { data: rows.map((r) => this.cannedView(r)) };
    }

    async cannedStore(ctx: HttpContext) {
        const actor = await this.requireAdmin(ctx);
        const payload = await cannedValidator.validate(ctx.request.body());
        const row = new TicketingCannedResponse();
        row.shortcut = payload.shortcut;
        row.title = payload.title;
        row.body = payload.body;
        row.createdByUserId = actor.userId;
        await row.save();
        ctx.response.status(201);
        return { data: this.cannedView(row) };
    }

    async cannedUpdate(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const row = await TicketingCannedResponse.query().where("id", Number(ctx.params.id)).first();
        if (!row) {
            throw new ResourceNotFoundException("Canned response not found");
        }
        const payload = await cannedUpdateValidator.validate(ctx.request.body());
        if (payload.shortcut !== undefined) row.shortcut = payload.shortcut;
        if (payload.title !== undefined) row.title = payload.title;
        if (payload.body !== undefined) row.body = payload.body;
        await row.save();
        return { data: this.cannedView(row) };
    }

    async tagsIndex(ctx: HttpContext) {
        await resolveShopAgent(ctx);
        const rows = await TicketingTag.query().orderBy("name", "asc");
        return { data: rows.map((t) => ({ id: String(t.id), name: String(t.name), color: t.color })) };
    }

    async tagsStore(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const payload = await tagValidator.validate(ctx.request.body());
        const tag = new TicketingTag();
        tag.name = payload.name;
        tag.color = payload.color ?? null;
        await tag.save();
        ctx.response.status(201);
        return { data: { id: String(tag.id), name: String(tag.name), color: tag.color } };
    }

    async tagsDestroy(ctx: HttpContext) {
        await this.requireAdmin(ctx);
        const tag = await TicketingTag.query().where("id", Number(ctx.params.id)).first();
        if (!tag) {
            throw new ResourceNotFoundException("Tag not found");
        }
        await tag.delete();
        return ctx.response.noContent();
    }

    /** Replace an agent's inbox membership set. */
    private async syncInboxMembers(agentId: number, inboxIds?: number[]): Promise<void> {
        if (inboxIds === undefined) {
            return;
        }
        await TicketingInboxMember.query().where("agent_id", agentId).delete();
        for (const inboxId of inboxIds) {
            const member = new TicketingInboxMember();
            member.agentId = agentId;
            member.inboxId = inboxId;
            await member.save();
        }
    }

    private cannedView(row: TicketingCannedResponse) {
        return {
            id: String(row.id),
            shortcut: String(row.shortcut),
            title: row.title,
            body: row.body,
            created_by_user_id: row.createdByUserId === null ? null : String(row.createdByUserId),
        };
    }
}
