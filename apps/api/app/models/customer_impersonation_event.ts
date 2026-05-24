import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerImpersonationEventSchema } from "#database/schema";
import Customer from "#models/customer";
import User from "#models/user";

export default class CustomerImpersonationEvent extends CustomerImpersonationEventSchema {
    static table = "customer_impersonation_events";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => User, { foreignKey: "impersonatorUserId" })
    declare impersonator: BelongsTo<typeof User>;
}
