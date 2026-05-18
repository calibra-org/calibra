import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderAddressIranExtensionSchema } from "#database/schema";
import OrderAddress from "#models/order_address";

/**
 * Pattern 3 snapshot extension. The row exists only when the snapshotted address carried Iran
 * fiscal-identifier fields; the absence of the row is itself the answer for "no extension." The
 * order_finalizer writes it inside the same transaction as `order_addresses`, so callers see the
 * pair atomically.
 */
export default class OrderAddressIranExtension extends OrderAddressIranExtensionSchema {
    static table = "order_address_iran_extensions";

    @belongsTo(() => OrderAddress, { foreignKey: "orderAddressId" })
    declare orderAddress: BelongsTo<typeof OrderAddress>;
}
