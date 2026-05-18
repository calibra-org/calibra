import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { CouponTranslationSchema } from "#database/schema";
import Coupon from "#models/coupon";

export default class CouponTranslation extends CouponTranslationSchema {
    static table = "coupon_translations";

    @belongsTo(() => Coupon, { foreignKey: "couponId" })
    declare coupon: BelongsTo<typeof Coupon>;
}
