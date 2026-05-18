import { beforeSave, column, hasMany, scope } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";
import { DateTime } from "luxon";

import { CouponSchema } from "#database/schema";
import CouponCategoryConstraint from "#models/coupon_category_constraint";
import CouponEmailRestriction from "#models/coupon_email_restriction";
import CouponProductConstraint from "#models/coupon_product_constraint";
import CouponRedemption from "#models/coupon_redemption";
import CouponTranslation from "#models/coupon_translation";

/**
 * Stable list of discount types — mirrors the CHECK constraint on the DB. Exported so the validator
 * and discounter can reuse the same source.
 */
export type CouponDiscountType = "percent" | "fixed_cart" | "fixed_product" | "free_shipping";

export type CouponStatus = "active" | "disabled";

export default class Coupon extends CouponSchema {
    static table = "coupons";

    /**
     * citext + uppercased on save = case-insensitive lookups (`WELCOME10` and `welcome10` both
     * resolve), with a canonical display form. The cast keeps the bigint/number-typed schema
     * column happy while we model it as a plain string at the app layer.
     */
    @column({ serializeAs: "code" })
    declare code: string;

    @hasMany(() => CouponTranslation, { foreignKey: "couponId" })
    declare translations: HasMany<typeof CouponTranslation>;

    @hasMany(() => CouponProductConstraint, { foreignKey: "couponId" })
    declare productConstraints: HasMany<typeof CouponProductConstraint>;

    @hasMany(() => CouponCategoryConstraint, { foreignKey: "couponId" })
    declare categoryConstraints: HasMany<typeof CouponCategoryConstraint>;

    @hasMany(() => CouponEmailRestriction, { foreignKey: "couponId" })
    declare emailRestrictions: HasMany<typeof CouponEmailRestriction>;

    @hasMany(() => CouponRedemption, { foreignKey: "couponId" })
    declare redemptions: HasMany<typeof CouponRedemption>;

    /**
     * Trim + uppercase on every save so the canonical form lives in the row regardless of how the
     * admin or storefront submitted it. The DB column is `citext` so equality still matches across
     * cases at the SQL level; this only normalizes display.
     */
    @beforeSave()
    static normalizeCode(coupon: Coupon): void {
        if (coupon.code) {
            coupon.code = coupon.code.trim().toUpperCase();
        }
    }

    /**
     * Live coupons only: not soft-deleted, status=active, within the optional starts_at / expires_at
     * window. Composes cleanly with `.where('code', code)` for the cart-apply lookup.
     */
    static activeAndCurrent = scope((query, now: DateTime = DateTime.utc()) => {
        const iso = now.toISO() ?? now.toUTC().toISO() ?? new Date().toISOString();
        query
            .whereNull("deleted_at")
            .where("status", "active")
            .where((q) => {
                q.whereNull("starts_at").orWhere("starts_at", "<=", iso);
            })
            .where((q) => {
                q.whereNull("expires_at").orWhere("expires_at", ">=", iso);
            });
    });
}
