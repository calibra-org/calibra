import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { TicketingMessageSchema } from "#database/schema";
import TicketingAttachment from "#models/ticketing_attachment";
import TicketingConversation from "#models/ticketing_conversation";

/** One entry in a conversation feed: public reply, internal note, system activity, or template. */
export default class TicketingMessage extends TicketingMessageSchema {
    static table = "ticketing_messages";

    @belongsTo(() => TicketingConversation, { foreignKey: "conversationId" })
    declare conversation: BelongsTo<typeof TicketingConversation>;

    @hasMany(() => TicketingAttachment, { foreignKey: "messageId" })
    declare attachments: HasMany<typeof TicketingAttachment>;
}
