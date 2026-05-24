import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerMarketingPrefSchema } from "#database/schema";
import Customer from "#models/customer";

export default class CustomerMarketingPref extends CustomerMarketingPrefSchema {
    static table = "customer_marketing_prefs";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;
}
