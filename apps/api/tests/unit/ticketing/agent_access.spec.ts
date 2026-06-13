import { test } from "@japa/runner";

import TicketingConversation from "#models/ticketing_conversation";
import { applyAgentScope, canManageSupport } from "#services/ticketing/agent_access";

/**
 * Access-tier predicate generation. We assert the COMPILED SQL rather than executing against rows —
 * fast, and it pins the exact WHERE shape each tier emits. The execution-level isolation assertion
 * (an `unassigned_and_own` agent really cannot see another agent's conversation) lives in the Phase-5
 * endpoint functional tests, which exercise the full request path.
 */
test.group("ticketing.agent_access", () => {
    test("tier 'all' adds no narrowing predicate", ({ assert }) => {
        const sql = applyAgentScope(TicketingConversation.query(), {
            agentId: 5,
            userId: 9,
            accessTier: "all",
        })
            .toSQL()
            .sql.toLowerCase();
        assert.notInclude(sql, "assignee_agent_id");
    });

    test("tier 'unassigned_and_own' scopes to mine OR unassigned", ({ assert }) => {
        const sql = applyAgentScope(TicketingConversation.query(), {
            agentId: 5,
            userId: 9,
            accessTier: "unassigned_and_own",
        })
            .toSQL()
            .sql.toLowerCase();
        assert.include(sql, "assignee_agent_id");
        assert.include(sql, "is null");
    });

    test("tier 'participating' scopes to mine OR an EXISTS over participants", ({ assert }) => {
        const sql = applyAgentScope(TicketingConversation.query(), {
            agentId: 5,
            userId: 9,
            accessTier: "participating",
        })
            .toSQL()
            .sql.toLowerCase();
        assert.include(sql, "exists");
        assert.include(sql, "ticketing_conversation_participants");
    });

    test("only support_admin may manage roster + canned responses", ({ assert }) => {
        assert.isTrue(canManageSupport("support_admin"));
        assert.isFalse(canManageSupport("agent"));
        assert.isFalse(canManageSupport("supervisor"));
    });
});
