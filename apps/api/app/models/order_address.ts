import { belongsTo, hasOne } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasOne } from "@adonisjs/lucid/types/relations";

import { OrderAddressSchema } from "#database/schema";
import Order from "#models/order";
import OrderAddressIranExtension from "#models/order_address_iran_extension";
import Region from "#models/region";

export default class OrderAddress extends OrderAddressSchema {
    static table = "order_addresses";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => Region, { foreignKey: "regionId" })
    declare region: BelongsTo<typeof Region>;

    /**
     * IR fiscal-identifier extension — present only on snapshotted addresses with country `IR` that
     * carried at least one fiscal identifier. The absence of a row means "no extension data," never
     * a `{}` placeholder.
     */
    @hasOne(() => OrderAddressIranExtension, { foreignKey: "orderAddressId" })
    declare iranExtension: HasOne<typeof OrderAddressIranExtension>;
}
