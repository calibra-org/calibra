import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderStatusHistorySchema } from "#database/schema";
import type { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import User from "#models/user";

/**
 * Append-only audit log written by the state machine on every transition. Customer-facing UI
 * surfaces this verbatim as the order timeline; internal tooling reads it for compliance.
 */
export default class OrderStatusHistory extends OrderStatusHistorySchema {
    static table = "order_status_history";

    @column()
    declare fromStatus: OrderStatus | null;

    @column()
    declare toStatus: OrderStatus;

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => User, { foreignKey: "changedByUserId" })
    declare changedByUser: BelongsTo<typeof User>;
}
