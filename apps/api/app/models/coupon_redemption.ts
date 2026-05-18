import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CouponRedemptionSchema } from "#database/schema";
import Coupon from "#models/coupon";
import Customer from "#models/customer";

export default class CouponRedemption extends CouponRedemptionSchema {
    static table = "coupon_redemptions";

    @belongsTo(() => Coupon, { foreignKey: "couponId" })
    declare coupon: BelongsTo<typeof Coupon>;

    /**
     * Nullable — guest redemptions have `customerId = null` and are matched by `emailSnapshot`
     * during per-user limit checks.
     */
    @belongsTo(() => Customer, { foreignKey: "customerId" })
    declare customer: BelongsTo<typeof Customer>;
}
