import type { AdminSchemas } from "@calibra/sdk";

import type { AdminCoupon, MoneyMinor } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminCoupon = Schemas["AdminCoupon"];

/**
 * SDK `AdminCoupon` → admin view `AdminCoupon`. Reduces the translation array into the
 * `LocalizedString` shape the page templates expect (one Persian + one English slot).
 */
export function toAdminCoupon(c: SdkAdminCoupon): AdminCoupon {
    const description = (c.translations ?? []).reduce<{ fa?: string; en?: string }>((acc, t) => {
        if (t.locale === "fa") acc.fa = t.description ?? "";
        if (t.locale === "en") acc.en = t.description ?? "";
        return acc;
    }, {});
    return {
        id: c.id,
        code: c.code,
        discountType: c.discount_type,
        amountMinor: c.amount_minor === null || c.amount_minor === undefined ? null : (Number(c.amount_minor) as MoneyMinor),
        amountPercent: c.amount_percent ?? null,
        description: { fa: description.fa ?? "", en: description.en ?? description.fa ?? "" },
        expiresAt: c.expires_at ?? null,
        individualUse: Boolean(c.individual_use),
        excludeSaleItems: Boolean(c.exclude_sale_items),
        minimumAmount:
            c.minimum_amount === null || c.minimum_amount === undefined ? null : (Number(c.minimum_amount) as MoneyMinor),
        maximumAmount:
            c.maximum_amount === null || c.maximum_amount === undefined ? null : (Number(c.maximum_amount) as MoneyMinor),
        usageLimitGlobal: c.usage_limit_global ?? null,
        usageLimitPerUser: c.usage_limit_per_user ?? null,
        freeShipping: Boolean(c.free_shipping),
        status: c.status === "active" ? "active" : "disabled",
        usageCount: 0,
    };
}
