import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerIranProfileSchema } from "#database/schema";
import Customer from "#models/customer";

export default class CustomerIranProfile extends CustomerIranProfileSchema {
    static table = "customer_iran_profiles";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;
}
