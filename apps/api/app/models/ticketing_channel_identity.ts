import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TicketingChannelIdentitySchema } from "#database/schema";
import Customer from "#models/customer";
import TicketingInbox from "#models/ticketing_inbox";
import User from "#models/user";

/** Chatwoot contact_inbox: the (inbox, address) tuple that is a conversation's return path. */
export default class TicketingChannelIdentity extends TicketingChannelIdentitySchema {
    static table = "ticketing_channel_identities";

    @belongsTo(() => TicketingInbox, { foreignKey: "inboxId" })
    declare inbox: BelongsTo<typeof TicketingInbox>;

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;
}
