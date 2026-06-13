import type { ModelQueryBuilderContract } from "@adonisjs/lucid/types/model";

import type TicketingConversation from "#models/ticketing_conversation";

/**
 * The access-tier authorization layer (R5). Given the calling agent's tier, it narrows a conversation
 * query to exactly the rows that agent may see. This is the ONLY role enforcement — it runs on EVERY
 * list/detail/mutation and is NEVER trusted from the client:
 *
 *  - `all` → no narrowing (sees the whole tenant's inbox).
 *  - `unassigned_and_own` → assigned to me OR unassigned.
 *  - `participating` → assigned to me OR I'm a participant (by user id).
 *
 * `support_admin` agents are seeded with tier `all`; regular agents default to `unassigned_and_own`.
 * A detail/mutation reuses the same predicate then asserts a row came back (404 otherwise) so an
 * out-of-scope id is indistinguishable from a missing one.
 */
export type AccessTier = "all" | "unassigned_and_own" | "participating";

export interface AgentScope {
    /** `ticketing_agents.id` of the caller. */
    agentId: number;
    /** The caller's underlying `users.id` (for participant matching). */
    userId: number;
    accessTier: AccessTier;
}

type ConversationQuery = ModelQueryBuilderContract<typeof TicketingConversation>;

/**
 * Apply the agent's access-tier predicate to a `ticketing_conversations` query, mutating and
 * returning the same builder. Callers pass an already tenant-scoped query.
 */
export function applyAgentScope(query: ConversationQuery, scope: AgentScope): ConversationQuery {
    if (scope.accessTier === "all") {
        return query;
    }

    if (scope.accessTier === "unassigned_and_own") {
        return query.where((builder) => {
            builder.where("assignee_agent_id", scope.agentId).orWhereNull("assignee_agent_id");
        });
    }

    return query.where((builder) => {
        builder.where("assignee_agent_id", scope.agentId).orWhereExists((sub) => {
            sub.from("ticketing_conversation_participants as p")
                .whereRaw("p.conversation_id = ticketing_conversations.id")
                .where("p.participant_kind", "user")
                .where("p.participant_id", scope.userId);
        });
    });
}

/**
 * Whether an agent may reassign conversations / manage roster + canned responses. `support_admin`
 * gates the agent/canned-management endpoints; `can_reassign` gates handing a ticket to someone else.
 */
export function canManageSupport(supportRole: string): boolean {
    return supportRole === "support_admin";
}
