import { BaseTransformer } from "@adonisjs/core/transformers";

import type TicketingMessage from "#models/ticketing_message";

/**
 * Operator-facing message shape (admin + platform). Includes the `private` flag and internal notes —
 * this transformer is for the OPERATOR surface only.
 *
 * The storefront/customer surface is phase 2, but the split is in place now: {@link isPublicMessage}
 * is the single predicate a future customer transformer must gate on, so an internal note (`private`)
 * can NEVER serialize to a customer (DoD security). Attachments emit the resolved media URL only when
 * `attachments.media` was preloaded.
 */
export default class TicketMessageTransformer extends BaseTransformer<TicketingMessage> {
    toObject() {
        const attachments = this.resource.attachments ?? [];
        return {
            id: String(this.resource.id),
            conversation_id: String(this.resource.conversationId),
            direction: this.resource.direction,
            kind: this.resource.kind,
            content_type: this.resource.contentType,
            body: this.resource.body,
            private: this.resource.private,
            author_kind: this.resource.authorKind,
            author_id: this.resource.authorId === null ? null : String(this.resource.authorId),
            status: this.resource.status,
            provider_message_id: this.resource.providerMessageId === null ? null : String(this.resource.providerMessageId),
            content_attributes: this.resource.contentAttributes ?? {},
            attachments: attachments.map((a) => ({
                id: String(a.id),
                media_id: String(a.mediaId),
                url: a.media?.url ?? null,
            })),
            created_at: this.resource.createdAt?.toISO() ?? null,
        };
    }
}

/** The contract a future customer-facing transformer MUST gate on: private/internal never ships. */
export function isPublicMessage(message: TicketingMessage): boolean {
    return !message.private && message.direction !== "internal";
}
