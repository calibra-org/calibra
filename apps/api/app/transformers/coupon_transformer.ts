import { BaseTransformer } from "@adonisjs/core/transformers";

import type Coupon from "#models/coupon";

/**
 * Owns the response shape for the `/admin/coupons` resource. Storefront-facing applied-coupon
 * lines are rendered inline by {@link CartTransformer} (the cart view already aggregates per-coupon
 * discount totals from {@link DiscounterResult}) — this transformer is admin-only.
 */
export default class CouponTransformer extends BaseTransformer<Coupon> {
    toObject() {
        return this.summary();
    }

    /**
     * Compact row for admin index / lookup screens — no constraint sets, no translations. Keeps
     * the payload small enough to ship paginated lists without preloading every relationship.
     */
    forList() {
        return this.summary();
    }

    /**
     * Full admin view including every constraint and translation. Caller must preload
     * `translations`, `productConstraints`, `categoryConstraints`, and `emailRestrictions` before
     * passing the model in; missing relationships render as empty arrays.
     */
    forAdmin() {
        const coupon = this.resource;
        return {
            ...this.summary(),
            translations: (coupon.translations ?? []).map((row) => ({
                locale: row.locale,
                description: row.description,
            })),
            product_constraints: (coupon.productConstraints ?? []).map((row) => ({
                product_id: Number(row.productId),
                mode: row.mode,
            })),
            category_constraints: (coupon.categoryConstraints ?? []).map((row) => ({
                category_id: Number(row.categoryId),
                mode: row.mode,
            })),
            email_restrictions: (coupon.emailRestrictions ?? []).map((row) => row.emailPattern),
            attributes: coupon.attributes ?? {},
        };
    }

    private summary() {
        const c = this.resource;
        return {
            id: Number(c.id),
            code: c.code,
            discount_type: c.discountType,
            amount_minor: c.amountMinor === null ? null : Number(c.amountMinor),
            amount_percent: c.amountPercent === null ? null : Number(c.amountPercent),
            starts_at: c.startsAt?.toISO() ?? null,
            expires_at: c.expiresAt?.toISO() ?? null,
            individual_use: c.individualUse,
            exclude_sale_items: c.excludeSaleItems,
            minimum_amount: c.minimumAmount === null ? null : Number(c.minimumAmount),
            maximum_amount: c.maximumAmount === null ? null : Number(c.maximumAmount),
            usage_limit_global: c.usageLimitGlobal,
            usage_limit_per_user: c.usageLimitPerUser,
            limit_usage_to_x_items: c.limitUsageToXItems,
            free_shipping: c.freeShipping,
            status: c.status,
            deleted_at: c.deletedAt?.toISO() ?? null,
            created_at: c.createdAt?.toISO() ?? null,
            updated_at: c.updatedAt?.toISO() ?? null,
        };
    }
}
