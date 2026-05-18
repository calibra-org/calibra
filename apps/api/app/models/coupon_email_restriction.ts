import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CouponEmailRestrictionSchema } from "#database/schema";
import Coupon from "#models/coupon";

export default class CouponEmailRestriction extends CouponEmailRestrictionSchema {
    static table = "coupon_email_restrictions";

    @belongsTo(() => Coupon, { foreignKey: "couponId" })
    declare coupon: BelongsTo<typeof Coupon>;
}
