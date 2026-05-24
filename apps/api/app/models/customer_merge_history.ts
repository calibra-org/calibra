import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerMergeHistorySchema } from "#database/schema";
import Customer from "#models/customer";
import User from "#models/user";

export default class CustomerMergeHistory extends CustomerMergeHistorySchema {
    static table = "customer_merge_history";

    @belongsTo(() => Customer, { foreignKey: "primaryCustomerId" })
    declare primary: BelongsTo<typeof Customer>;

    @belongsTo(() => User, { foreignKey: "actorUserId" })
    declare actor: BelongsTo<typeof User>;
}
