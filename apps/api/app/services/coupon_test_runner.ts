import type { I18n } from "@adonisjs/i18n";

import type { DiscounterItem } from "#contracts/discounter";
import type Coupon from "#models/coupon";
import Product from "#models/product";
import { checkEligibility, computeDiscounts, countRedemptions } from "#services/discounter_service";

export interface CouponTestPayload {
    customer_id?: number | null;
    email?: string | null;
    line_items: { product_id: number; quantity: number; price_minor?: number }[];
    shipping_method_id?: number | null;
    country?: string;
}

export interface CouponTestResult {
    eligible: boolean;
    reason?: string;
    reason_message?: string;
    calculation?: {
        items_subtotal_minor: number;
        discount_minor: number;
        shipping_minor: number;
        grand_total_minor: number;
    };
}

/**
 * Synthetic-cart eligibility + discount calculation for the admin "Quick test" panel. Builds the
 * same {@link CouponSnapshot} / {@link DiscounterInput} shape the cart pipeline uses, then calls
 * the existing eligibility check and discount math — no DB writes, no redemption inserts. Brand
 * constraints are folded into the same `productConstraints` set so the existing item-eligibility
 * logic enforces them without a parallel code path.
 */
export async function runCouponTest(coupon: Coupon, payload: CouponTestPayload, i18n: I18n): Promise<CouponTestResult> {
    const productIds = payload.line_items.map((i) => i.product_id);
    const products = await Product.query().whereIn("id", productIds).preload("categories");
    const productById = new Map<number, Product>();
    for (const p of products) productById.set(Number(p.id), p);

    const items: DiscounterItem[] = payload.line_items.map((row, index) => {
        const product = productById.get(row.product_id);
        const price = row.price_minor ?? Number(product?.regularPrice ?? product?.salePrice ?? 0);
        const lineSubtotal = price * row.quantity;
        const categoryIds = (product?.categories ?? []).map((c) => Number(c.id));
        const onSale =
            product?.salePrice !== undefined &&
            product?.salePrice !== null &&
            Number(product.salePrice) < Number(product.regularPrice ?? 0);
        return {
            lineKey: `synthetic-${index}`,
            productId: row.product_id,
            variationId: null,
            quantity: row.quantity,
            priceSnapshot: price,
            lineSubtotal,
            categoryIds,
            tagIds: [],
            onSale,
        };
    });

    const itemsTotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);

    /** Build the snapshot directly from the loaded Lucid model — already preloaded by the caller. */
    const productConstraints = (coupon.productConstraints ?? []).map((row) => ({
        productId: Number(row.productId),
        mode: row.mode as "include" | "exclude",
    }));
    const categoryConstraints = (coupon.categoryConstraints ?? []).map((row) => ({
        categoryId: Number(row.categoryId),
        mode: row.mode as "include" | "exclude",
    }));
    const emailRestrictions = (coupon.emailRestrictions ?? []).map((row) => row.emailPattern);

    const snapshot = {
        id: Number(coupon.id),
        code: coupon.code,
        discountType: coupon.discountType as "percent" | "fixed_cart" | "fixed_product" | "free_shipping",
        amountMinor: coupon.amountMinor === null ? null : Number(coupon.amountMinor),
        amountPercent: coupon.amountPercent === null ? null : Number(coupon.amountPercent),
        status: coupon.status as "active" | "disabled",
        startsAt: coupon.startsAt,
        expiresAt: coupon.expiresAt,
        minimumAmount: coupon.minimumAmount === null ? null : Number(coupon.minimumAmount),
        maximumAmount: coupon.maximumAmount === null ? null : Number(coupon.maximumAmount),
        individualUse: coupon.individualUse,
        excludeSaleItems: coupon.excludeSaleItems,
        usageLimitGlobal: coupon.usageLimitGlobal,
        usageLimitPerUser: coupon.usageLimitPerUser,
        limitUsageToXItems: coupon.limitUsageToXItems,
        freeShipping: coupon.freeShipping,
        productConstraints,
        categoryConstraints,
        emailRestrictions,
    };

    const globalCount = snapshot.usageLimitGlobal !== null ? await countRedemptions(snapshot.id) : 0;
    const perUserCount =
        snapshot.usageLimitPerUser !== null && (payload.customer_id || payload.email)
            ? await countRedemptions(snapshot.id, { customerId: payload.customer_id ?? null, email: payload.email ?? null })
            : 0;

    const eligibility = checkEligibility({
        coupon: snapshot,
        items,
        itemsTotal,
        otherAppliedCouponIds: [],
        customer:
            payload.customer_id || payload.email
                ? { customerId: payload.customer_id ?? null, email: payload.email ?? null }
                : null,
        globalRedemptionCount: globalCount,
        perUserRedemptionCount: perUserCount,
    });

    if (!eligibility.ok) {
        return {
            eligible: false,
            reason: eligibility.reason,
            reason_message: i18n.t(`messages.errors.coupons.${eligibility.reason}` as never, { default: eligibility.reason }),
        };
    }

    const discount = computeDiscounts(
        { items, itemsTotal, appliedCoupons: [{ id: snapshot.id, code: snapshot.code }], customer: null },
        [snapshot],
    );

    return {
        eligible: true,
        calculation: {
            items_subtotal_minor: itemsTotal,
            discount_minor: discount.discountTotal,
            shipping_minor: 0,
            grand_total_minor: Math.max(0, itemsTotal - discount.discountTotal),
        },
    };
}
