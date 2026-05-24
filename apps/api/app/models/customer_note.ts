import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerNoteSchema } from "#database/schema";
import Customer from "#models/customer";
import User from "#models/user";

export default class CustomerNote extends CustomerNoteSchema {
    static table = "customer_notes";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => User, { foreignKey: "authorUserId" })
    declare author: BelongsTo<typeof User>;
}
