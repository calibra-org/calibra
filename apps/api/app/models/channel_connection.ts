import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { ChannelConnectionSchema } from "#database/schema";
import ChannelSecret from "#models/channel_secret";

/** A tenant's binding to an external channel provider; the webhook routing key is `endpointId`. */
export default class ChannelConnection extends ChannelConnectionSchema {
    static table = "channel_connections";

    @hasMany(() => ChannelSecret, { foreignKey: "connectionId" })
    declare secrets: HasMany<typeof ChannelSecret>;
}
