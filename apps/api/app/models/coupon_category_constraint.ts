import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CouponCategoryConstraintSchema } from "#database/schema";
import Coupon from "#models/coupon";
import ProductCategory from "#models/product_category";

export default class CouponCategoryConstraint extends CouponCategoryConstraintSchema {
    static table = "coupon_category_constraints";

    @belongsTo(() => Coupon, { foreignKey: "couponId" })
    declare coupon: BelongsTo<typeof Coupon>;

    @belongsTo(() => ProductCategory, { foreignKey: "categoryId" })
    declare category: BelongsTo<typeof ProductCategory>;
}
