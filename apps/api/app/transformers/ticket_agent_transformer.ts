import { BaseTransformer } from "@adonisjs/core/transformers";

import type TicketingAgent from "#models/ticketing_agent";

/** Support-roster row: the agent's role + access tier + the underlying user identity. */
export default class TicketAgentTransformer extends BaseTransformer<TicketingAgent> {
    toObject() {
        const user = this.resource.user ?? null;
        return {
            id: String(this.resource.id),
            user_id: String(this.resource.userId),
            support_role: this.resource.supportRole,
            access_tier: this.resource.accessTier,
            can_reassign: this.resource.canReassign,
            max_open_capacity: this.resource.maxOpenCapacity,
            status: this.resource.status,
            user: user ? { id: String(user.id), email: user.email } : null,
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }
}
