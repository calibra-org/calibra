import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CartItemSchema } from "#database/schema";
import Cart from "#models/cart";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";

export default class CartItem extends CartItemSchema {
    static table = "cart_items";

    @belongsTo(() => Cart, { foreignKey: "cartId" })
    declare cart: BelongsTo<typeof Cart>;

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;

    @belongsTo(() => ProductVariation, { foreignKey: "variationId" })
    declare variation: BelongsTo<typeof ProductVariation>;
}
