import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerStatusHistorySchema } from "#database/schema";
import Customer from "#models/customer";
import User from "#models/user";

export default class CustomerStatusHistory extends CustomerStatusHistorySchema {
    static table = "customer_status_history";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => User, { foreignKey: "actorUserId" })
    declare actor: BelongsTo<typeof User>;
}
