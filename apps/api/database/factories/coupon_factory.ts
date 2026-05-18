import factory from "@adonisjs/lucid/factories";

import Coupon from "#models/coupon";

let counter = 0;

/**
 * Defaults align with the most common coupon shape — a simple percent-off, active, no constraints.
 * States override into each of the other discount types so functional tests don't have to remember
 * the CHECK-constraint shape on each.
 */
export const CouponFactory = factory
    .define(Coupon, async () => {
        counter += 1;
        return {
            code: `TEST${counter}`,
            discountType: "percent" as const,
            amountMinor: null,
            amountPercent: "10.00",
            individualUse: false,
            excludeSaleItems: false,
            freeShipping: false,
            status: "active" as const,
            attributes: {},
        };
    })
    .state("percent", (coupon) => {
        coupon.discountType = "percent";
        coupon.amountMinor = null;
        coupon.amountPercent = "10.00";
    })
    .state("fixedCart", (coupon) => {
        coupon.discountType = "fixed_cart";
        coupon.amountMinor = 5_000_000;
        coupon.amountPercent = null;
    })
    .state("fixedProduct", (coupon) => {
        coupon.discountType = "fixed_product";
        coupon.amountMinor = 100_000;
        coupon.amountPercent = null;
    })
    .state("freeShipping", (coupon) => {
        coupon.discountType = "free_shipping";
        coupon.amountMinor = null;
        coupon.amountPercent = null;
        coupon.freeShipping = true;
    })
    .state("disabled", (coupon) => {
        coupon.status = "disabled";
    })
    .state("individualUse", (coupon) => {
        coupon.individualUse = true;
    })
    .build();
