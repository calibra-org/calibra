import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { OrderRefundSchema } from "#database/schema";
import Order from "#models/order";
import OrderRefundLineItem from "#models/order_refund_line_item";
import User from "#models/user";

/**
 * Refund aggregate. Each row carries the rolled-up money totals; the per-line breakdown lives on
 * {@link OrderRefundLineItem}. The `idempotency_key` column is `serializeAs: null` so the raw
 * header value never echoes back in API responses — only the canonical refund row does.
 */
export default class OrderRefund extends OrderRefundSchema {
    static table = "order_refunds";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => User, { foreignKey: "refundedByUserId" })
    declare refundedByUser: BelongsTo<typeof User>;

    @hasMany(() => OrderRefundLineItem, { foreignKey: "refundId" })
    declare lineItems: HasMany<typeof OrderRefundLineItem>;
}
