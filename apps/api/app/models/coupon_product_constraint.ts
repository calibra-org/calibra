import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CouponProductConstraintSchema } from "#database/schema";
import Coupon from "#models/coupon";
import Product from "#models/product";

export default class CouponProductConstraint extends CouponProductConstraintSchema {
    static table = "coupon_product_constraints";

    @belongsTo(() => Coupon, { foreignKey: "couponId" })
    declare coupon: BelongsTo<typeof Coupon>;

    @belongsTo(() => Product, { foreignKey: "productId" })
    declare product: BelongsTo<typeof Product>;
}
