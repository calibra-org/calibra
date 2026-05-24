import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderMetaSchema } from "#database/schema";
import Order from "#models/order";

/**
 * Per-order key/value bag mirroring WordPress `postmeta`. Keys prefixed with `_` are conventionally
 * hidden from the admin editor unless the operator opts in. Lookups inside controllers go through
 * the unique `(order_id, key)` index so upsert collisions stay cheap.
 */
export default class OrderMeta extends OrderMetaSchema {
    static table = "order_meta";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;
}
