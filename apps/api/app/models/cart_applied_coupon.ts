import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CartAppliedCouponSchema } from "#database/schema";
import Cart from "#models/cart";

export default class CartAppliedCoupon extends CartAppliedCouponSchema {
    static table = "cart_applied_coupons";

    @belongsTo(() => Cart, { foreignKey: "cartId" })
    declare cart: BelongsTo<typeof Cart>;
}
