import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderShippingLineSchema } from "#database/schema";
import Order from "#models/order";

export default class OrderShippingLine extends OrderShippingLineSchema {
    static table = "order_shipping_lines";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;
}
