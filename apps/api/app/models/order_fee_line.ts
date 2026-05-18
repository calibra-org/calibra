import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderFeeLineSchema } from "#database/schema";
import Order from "#models/order";

export default class OrderFeeLine extends OrderFeeLineSchema {
    static table = "order_fee_lines";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;
}
