import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { TicketingConversationSchema } from "#database/schema";
import TicketingAgent from "#models/ticketing_agent";
import TicketingChannelIdentity from "#models/ticketing_channel_identity";
import TicketingConversationParticipant from "#models/ticketing_conversation_participant";
import TicketingConversationTag from "#models/ticketing_conversation_tag";
import TicketingInbox from "#models/ticketing_inbox";
import TicketingMessage from "#models/ticketing_message";

/** A thread on one inbox from one channel identity, in one of two contexts (shop / platform, R5). */
export default class TicketingConversation extends TicketingConversationSchema {
    static table = "ticketing_conversations";

    @belongsTo(() => TicketingInbox, { foreignKey: "inboxId" })
    declare inbox: BelongsTo<typeof TicketingInbox>;

    @belongsTo(() => TicketingChannelIdentity, { foreignKey: "channelIdentityId" })
    declare channelIdentity: BelongsTo<typeof TicketingChannelIdentity>;

    @belongsTo(() => TicketingAgent, { foreignKey: "assigneeAgentId" })
    declare assignee: BelongsTo<typeof TicketingAgent>;

    @hasMany(() => TicketingMessage, { foreignKey: "conversationId" })
    declare messages: HasMany<typeof TicketingMessage>;

    @hasMany(() => TicketingConversationParticipant, { foreignKey: "conversationId" })
    declare participants: HasMany<typeof TicketingConversationParticipant>;

    @hasMany(() => TicketingConversationTag, { foreignKey: "conversationId" })
    declare conversationTags: HasMany<typeof TicketingConversationTag>;
}
