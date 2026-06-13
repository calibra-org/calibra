import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { TicketingAgentSchema } from "#database/schema";
import User from "#models/user";

/** A tenant user promoted to a support actor with a support_role + access_tier (R5). */
export default class TicketingAgent extends TicketingAgentSchema {
    static table = "ticketing_agents";

    @belongsTo(() => User, { foreignKey: "userId" })
    declare user: BelongsTo<typeof User>;
}
