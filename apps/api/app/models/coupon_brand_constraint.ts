import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CouponBrandConstraintSchema } from "#database/schema";
import Coupon from "#models/coupon";
import ProductBrand from "#models/product_brand";

export default class CouponBrandConstraint extends CouponBrandConstraintSchema {
    static table = "coupon_brand_constraints";

    @belongsTo(() => Coupon, { foreignKey: "couponId" })
    declare coupon: BelongsTo<typeof Coupon>;

    @belongsTo(() => ProductBrand, { foreignKey: "brandId" })
    declare brand: BelongsTo<typeof ProductBrand>;
}
