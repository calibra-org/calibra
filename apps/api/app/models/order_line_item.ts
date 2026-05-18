import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { OrderLineItemSchema } from "#database/schema";
import Order from "#models/order";
import OrderLineItemTax from "#models/order_line_item_tax";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";

export default class OrderLineItem extends OrderLineItemSchema {
    static table = "order_line_items";

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    /** Advisory FK — the line survives product deletion via the snapshot columns. */
    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => ProductVariation, { foreignKey: "variationId" })
    declare variation: BelongsTo<typeof ProductVariation>;

    @hasMany(() => OrderLineItemTax, { foreignKey: "lineItemId" })
    declare taxes: HasMany<typeof OrderLineItemTax>;
}
