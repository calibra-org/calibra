import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import TicketingConversation from "#models/ticketing_conversation";

/**
 * Control-plane internal-ticket queue view (cross-tenant). The controller pins
 * `context = platform_internal` and runs on `postgres_admin` (BYPASSRLS); `tenant_id` is a filterable
 * column so an operator can narrow to one shop.
 */
export const platformTicketsView = createTableView({
    model: TicketingConversation,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        display_id: { type: "bigint", filterable: true, orderable: true },
        tenant_id: { type: "bigint", filterable: true, orderable: false },
        status: { type: "string", filterable: true, orderable: false },
        priority: { type: "string", filterable: true, orderable: false },
        last_activity_at: { type: "datetime", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["last_activity_at", "desc"],
        ["id", "desc"],
    ],
});

export type PlatformTicketsViewQuery = InferTableViewQuery<typeof platformTicketsView>;
