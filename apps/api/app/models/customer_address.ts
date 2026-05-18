import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CustomerAddressSchema } from "#database/schema";
import Customer from "#models/customer";
import Region from "#models/region";

export default class CustomerAddress extends CustomerAddressSchema {
    static table = "customer_addresses";

    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;

    @belongsTo(() => Region, { foreignKey: "regionId" })
    declare region: BelongsTo<typeof Region>;
}
