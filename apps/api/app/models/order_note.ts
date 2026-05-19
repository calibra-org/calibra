import { belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderNoteSchema } from "#database/schema";
import Order from "#models/order";
import User from "#models/user";

export type OrderNoteVisibility = "internal" | "customer";

/**
 * Flat order note — same shape WooCommerce uses for `wc_order_notes`. The {@link visibility} enum
 * decides whether the row is ever exposed on customer-facing endpoints; `internal` rows are
 * admin-only. `authorUserId` is NULL on system-emitted rows (refund audit comments,
 * status-change auto-notes, …).
 */
export default class OrderNote extends OrderNoteSchema {
    static table = "order_notes";

    @column()
    declare visibility: OrderNoteVisibility;

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => User, { foreignKey: "authorUserId" })
    declare author: BelongsTo<typeof User>;
}
