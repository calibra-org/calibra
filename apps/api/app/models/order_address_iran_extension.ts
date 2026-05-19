import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderAddressIranExtensionSchema } from "#database/schema";
import OrderAddress from "#models/order_address";

/**
 * Country-scoped extension carrying the IR fiscal identifiers (national id, corporate id,
 * economic code, legal company name) for a snapshotted order address. The row exists only when
 * the address carried at least one of those fields — the absence of the row is itself the answer
 * for "no extension." `order_finalizer` writes it inside the same transaction as the parent
 * `order_addresses` row, so callers see the pair atomically.
 */
export default class OrderAddressIranExtension extends OrderAddressIranExtensionSchema {
    static table = "order_address_iran_extensions";

    @belongsTo(() => OrderAddress, { foreignKey: "orderAddressId" })
    declare orderAddress: BelongsTo<typeof OrderAddress>;
}
