import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

import Coupon from "#models/coupon";
import CouponCategoryConstraint from "#models/coupon_category_constraint";
import CouponEmailRestriction from "#models/coupon_email_restriction";
import CouponTranslation from "#models/coupon_translation";

interface DemoCoupon {
    code: string;
    discountType: "percent" | "fixed_cart" | "fixed_product" | "free_shipping";
    amountMinor?: number;
    amountPercent?: string;
    expiresInDays?: number;
    individualUse?: boolean;
    excludeSaleItems?: boolean;
    minimumAmount?: number;
    usageLimitGlobal?: number;
    usageLimitPerUser?: number;
    freeShipping?: boolean;
    description: { fa: string; en: string };
    categoryName?: string;
    emailRestrictions?: string[];
}

/**
 * Five demo coupons covering each discount type + the most common modifier combinations. The
 * seeder is idempotent: every coupon upserts on `code`, and constraint sets are full-replaced so
 * re-running won't accumulate duplicates.
 */
export default class CouponsDemoSeeder extends BaseSeeder {
    async run() {
        const apparelCategoryId = await this.findCategoryIdByName("پوشاک");

        const demo: DemoCoupon[] = [
            {
                code: "WELCOME10",
                discountType: "percent",
                amountPercent: "10.00",
                expiresInDays: 30,
                usageLimitPerUser: 1,
                description: { fa: "تخفیف ۱۰٪ خوش‌آمدگویی", en: "Welcome 10% off" },
            },
            {
                code: "FLAT500K",
                discountType: "fixed_cart",
                amountMinor: 5_000_000,
                minimumAmount: 30_000_000,
                description: { fa: "۵۰۰٬۰۰۰ تومان تخفیف نقدی", en: "5,000,000 IRR cart discount" },
            },
            {
                code: "SHIPFREE",
                discountType: "free_shipping",
                individualUse: true,
                freeShipping: true,
                description: { fa: "ارسال رایگان", en: "Free shipping" },
            },
            {
                code: "SUMMER25",
                discountType: "percent",
                amountPercent: "25.00",
                excludeSaleItems: true,
                description: { fa: "۲۵٪ تخفیف پوشاک تابستان", en: "25% off summer apparel" },
                categoryName: "پوشاک",
            },
            {
                code: "VIPCASH",
                discountType: "fixed_cart",
                amountMinor: 10_000_000,
                usageLimitGlobal: 10,
                description: { fa: "تخفیف نقدی ویژه VIP", en: "VIP-only cash discount" },
                emailRestrictions: ["vip@*"],
            },
        ];

        for (const row of demo) {
            await this.upsertCoupon(row, apparelCategoryId);
        }
    }

    private async upsertCoupon(row: DemoCoupon, apparelCategoryId: number | null): Promise<void> {
        const expiresAt = row.expiresInDays === undefined ? null : DateTime.utc().plus({ days: row.expiresInDays });
        const code = row.code.toUpperCase();
        const coupon = await Coupon.updateOrCreate(
            { code },
            {
                code,
                discountType: row.discountType,
                amountMinor: row.amountMinor ?? null,
                amountPercent: row.amountPercent ?? null,
                startsAt: null,
                expiresAt,
                individualUse: row.individualUse ?? false,
                excludeSaleItems: row.excludeSaleItems ?? false,
                minimumAmount: row.minimumAmount ?? null,
                maximumAmount: null,
                usageLimitGlobal: row.usageLimitGlobal ?? null,
                usageLimitPerUser: row.usageLimitPerUser ?? null,
                limitUsageToXItems: null,
                freeShipping: row.freeShipping ?? false,
                status: "active",
                attributes: {},
            },
        );

        const couponId = Number(coupon.id);
        await CouponTranslation.query().where("coupon_id", couponId).delete();
        for (const [locale, description] of Object.entries(row.description)) {
            await CouponTranslation.create({ couponId: coupon.id, locale, description });
        }

        if (row.categoryName && apparelCategoryId !== null && row.categoryName === "پوشاک") {
            await CouponCategoryConstraint.query().where("coupon_id", couponId).delete();
            await CouponCategoryConstraint.create({
                couponId: coupon.id,
                categoryId: apparelCategoryId,
                mode: "include",
            });
        }

        if (row.emailRestrictions && row.emailRestrictions.length > 0) {
            await CouponEmailRestriction.query().where("coupon_id", couponId).delete();
            for (const pattern of row.emailRestrictions) {
                await CouponEmailRestriction.create({ couponId: coupon.id, emailPattern: pattern });
            }
        }
    }

    private async findCategoryIdByName(faName: string): Promise<number | null> {
        const row = await this.client.from("product_category_translations").where("locale", "fa").where("name", faName).first();
        return row ? Number(row.category_id) : null;
    }
}
