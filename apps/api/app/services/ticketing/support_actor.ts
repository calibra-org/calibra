import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import TicketingAgent from "#models/ticketing_agent";
import { currentTrx } from "#services/tenant_context";
import type { AgentScope } from "#services/ticketing/agent_access";

/**
 * Resolves the support actor behind a shop request and their access scope (R5). A `ticketing_agents`
 * row promotes a tenant `user` into a support actor; shop admins are auto-promoted to
 * `support_admin` / `all` on first touch (matching the seed migration's backfill), so a brand-new
 * shop always has at least one operator who can see the whole inbox. A non-admin staff member with
 * no agent row is not a support actor → 403.
 */
export interface ShopActor {
    agentId: number;
    userId: number;
    supportRole: string;
    canReassign: boolean;
    scope: AgentScope;
}

/** Find the calling user's agent row, auto-creating one for shop admins. Throws 403 otherwise. */
export async function resolveShopAgent(ctx: HttpContext): Promise<ShopActor> {
    const user = ctx.auth.getUserOrFail();
    const userId = Number(user.id);
    const trx = currentTrx();

    let agent = await TicketingAgent.query({ client: trx }).where("user_id", userId).first();

    if (!agent && user.role === "admin") {
        agent = new TicketingAgent();
        agent.userId = userId;
        agent.supportRole = "support_admin";
        agent.accessTier = "all";
        agent.canReassign = true;
        agent.status = "active";
        agent.useTransaction(trx);
        await agent.save();
    }

    if (!agent || agent.status !== "active") {
        throw new Exception("Not a support agent", { status: 403, code: "E_NOT_A_SUPPORT_AGENT" });
    }

    return {
        agentId: Number(agent.id),
        userId,
        supportRole: agent.supportRole,
        canReassign: agent.canReassign,
        scope: { agentId: Number(agent.id), userId, accessTier: agent.accessTier as AgentScope["accessTier"] },
    };
}
