import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerMarketingConsentHistorySchema } from "#database/schema";
import Customer from "#models/customer";
import User from "#models/user";

export default class CustomerMarketingConsentHistory extends CustomerMarketingConsentHistorySchema {
    static table = "customer_marketing_consent_history";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => User, { foreignKey: "actorUserId" })
    declare actor: BelongsTo<typeof User>;
}
