import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderRefundLineItemSchema } from "#database/schema";
import OrderLineItem from "#models/order_line_item";
import OrderRefund from "#models/order_refund";

/**
 * Per-source-line breakdown of a refund. Joins through to the canonical {@link OrderLineItem} so
 * receipts and tax reports can roll up the (quantity, amount, tax) tuple back to the original
 * sale. The UNIQUE `(refund_id, order_line_item_id)` constraint (DDL-side) keeps a single refund
 * from double-counting one source line.
 */
export default class OrderRefundLineItem extends OrderRefundLineItemSchema {
    static table = "order_refund_line_items";

    @belongsTo(() => OrderRefund, { foreignKey: "refundId" })
    declare refund: BelongsTo<typeof OrderRefund>;

    @belongsTo(() => OrderLineItem, { foreignKey: "orderLineItemId" })
    declare orderLineItem: BelongsTo<typeof OrderLineItem>;
}
