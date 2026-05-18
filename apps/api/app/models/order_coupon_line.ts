import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderCouponLineSchema } from "#database/schema";
import Order from "#models/order";

export default class OrderCouponLine extends OrderCouponLineSchema {
    static table = "order_coupon_lines";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;
}
