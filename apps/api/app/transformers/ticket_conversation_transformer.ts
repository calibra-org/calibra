import { BaseTransformer } from "@adonisjs/core/transformers";

import type TicketingConversation from "#models/ticketing_conversation";

/**
 * Admin/platform-facing conversation shape. Optional relations (`inbox`, `channelIdentity`,
 * `conversationTags.tag`) are emitted only when the controller preloaded them, so the same
 * transformer serves both the list (lean) and detail (rich) responses. Never exposes another
 * tenant's data — the query that produced `this.resource` is already tenant-scoped.
 */
export default class TicketConversationTransformer extends BaseTransformer<TicketingConversation> {
    toObject() {
        const inbox = this.resource.inbox ?? null;
        const identity = this.resource.channelIdentity ?? null;
        const tags = this.resource.conversationTags ?? [];
        return {
            id: String(this.resource.id),
            display_id: Number(this.resource.displayId),
            context: this.resource.context,
            subject: this.resource.subject,
            status: this.resource.status,
            priority: this.resource.priority,
            inbox_id: String(this.resource.inboxId),
            channel_identity_id: String(this.resource.channelIdentityId),
            assignee_agent_id: this.resource.assigneeAgentId === null ? null : String(this.resource.assigneeAgentId),
            inbox: inbox ? { id: String(inbox.id), name: inbox.name, channel_type: inbox.channelType } : null,
            requester: identity ? { name: identity.displayName, identity: String(identity.channelIdentity) } : null,
            tags: tags
                .filter((ct) => ct.tag)
                .map((ct) => ({ id: String(ct.tag.id), name: String(ct.tag.name), color: ct.tag.color })),
            last_activity_at: this.resource.lastActivityAt?.toISO() ?? null,
            first_response_at: this.resource.firstResponseAt?.toISO() ?? null,
            waiting_since: this.resource.waitingSince?.toISO() ?? null,
            snoozed_until: this.resource.snoozedUntil?.toISO() ?? null,
            created_at: this.resource.createdAt?.toISO() ?? null,
            updated_at: this.resource.updatedAt?.toISO() ?? null,
        };
    }
}
