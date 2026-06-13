import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import TicketingConversation from "#models/ticketing_conversation";

/**
 * Admin ticket-inbox list view — the simple per-column filter/sort surface. Status tabs, free-text
 * search (`q`), and the access-tier predicate stay controller-side (the tier scope can't be a
 * client-supplied per-field filter — it's the authorization boundary, R5).
 */
export const adminTicketsView = createTableView({
    model: TicketingConversation,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        display_id: { type: "bigint", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: false },
        priority: { type: "string", filterable: true, orderable: false },
        inbox_id: { type: "bigint", filterable: true, orderable: false },
        assignee_agent_id: { type: "bigint", filterable: true, orderable: false },
        last_activity_at: { type: "datetime", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["last_activity_at", "desc"],
        ["id", "desc"],
    ],
});

export type AdminTicketsViewQuery = InferTableViewQuery<typeof adminTicketsView>;
