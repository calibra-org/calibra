import { BaseTransformer } from "@adonisjs/core/transformers";

import type CouponRedemption from "#models/coupon_redemption";

export default class CouponRedemptionTransformer extends BaseTransformer<CouponRedemption> {
    toObject() {
        const r = this.resource;
        return {
            id: Number(r.id),
            coupon_id: Number(r.couponId),
            order_id: Number(r.orderId),
            customer_id: r.customerId === null ? null : Number(r.customerId),
            email_snapshot: r.emailSnapshot,
            redeemed_at: r.redeemedAt?.toISO() ?? null,
            created_at: r.createdAt?.toISO() ?? null,
        };
    }
}
