import { BaseTransformer } from "@adonisjs/core/transformers";

import type Coupon from "#models/coupon";

/** Per-row aggregate sidecar attached via `setStats` before serialization. */
export interface CouponListStats {
    productConstraintsCount: number;
    categoryConstraintsCount: number;
    brandConstraintsCount: number;
    emailRestrictionsCount: number;
    redemptionsCount: number;
    recentRedemptions7d: number;
    descriptionFa: string | null;
    descriptionEn: string | null;
}

/**
 * Owns the response shape for the `/admin/coupons` resource. Storefront-facing applied-coupon
 * lines are rendered inline by {@link CartTransformer} (the cart view already aggregates per-coupon
 * discount totals from {@link DiscounterResult}) — this transformer is admin-only.
 */
export default class CouponTransformer extends BaseTransformer<Coupon> {
    private static statsByCoupon = new Map<number, CouponListStats>();

    /** Inject a per-row aggregate sidecar so `forList` can surface count + description fields. */
    static setStats(statsByCoupon: Map<number, CouponListStats>) {
        CouponTransformer.statsByCoupon = statsByCoupon;
    }

    toObject() {
        return this.summary();
    }

    /**
     * Compact row for admin index / lookup screens. Sidecar stats (constraint + redemption counts
     * + recent redemptions in the last 7 days) come from the list-controller aggregate query;
     * missing entries default to zero so the shape stays stable even when stats weren't loaded.
     */
    forList() {
        const sidecar = CouponTransformer.statsByCoupon.get(Number(this.resource.id));
        return {
            ...this.summary(),
            product_constraints_count: sidecar?.productConstraintsCount ?? 0,
            category_constraints_count: sidecar?.categoryConstraintsCount ?? 0,
            brand_constraints_count: sidecar?.brandConstraintsCount ?? 0,
            email_restrictions_count: sidecar?.emailRestrictionsCount ?? 0,
            redemptions_count: sidecar?.redemptionsCount ?? 0,
            recent_redemptions_7d: sidecar?.recentRedemptions7d ?? 0,
            description_fa: sidecar?.descriptionFa ?? null,
            description_en: sidecar?.descriptionEn ?? null,
        };
    }

    /**
     * Full admin view including every constraint and translation. Caller must preload
     * `translations`, `productConstraints`, `categoryConstraints`, `brandConstraints`, and
     * `emailRestrictions` before passing the model in; missing relationships render as empty
     * arrays.
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
            brand_constraints: (coupon.brandConstraints ?? []).map((row) => ({
                brand_id: Number(row.brandId),
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
