import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TicketingInboxSchema } from "#database/schema";
import ChannelConnection from "#models/channel_connection";

/** A routing surface bound to one channel type (internal or, phase-2, an external provider). */
export default class TicketingInbox extends TicketingInboxSchema {
    static table = "ticketing_inboxes";

    @belongsTo(() => ChannelConnection, { foreignKey: "channelConnectionId" })
    declare connection: BelongsTo<typeof ChannelConnection>;
}
