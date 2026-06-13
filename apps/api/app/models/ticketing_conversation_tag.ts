import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TicketingConversationTagSchema } from "#database/schema";
import TicketingTag from "#models/ticketing_tag";

/** Join row linking a conversation to a tag. */
export default class TicketingConversationTag extends TicketingConversationTagSchema {
    static table = "ticketing_conversation_tags";

    @belongsTo(() => TicketingTag, { foreignKey: "tagId" })
    declare tag: BelongsTo<typeof TicketingTag>;
}
