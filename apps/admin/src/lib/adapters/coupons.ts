import type { AdminSchemas } from "@calibra/sdk";

import type { AdminCoupon, MoneyMinor } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminCoupon = Schemas["AdminCoupon"];

interface Constraint {
    mode: "include" | "exclude";
}
function bucket<T extends Constraint>(rows: T[] | undefined, key: keyof T): { include: number[]; exclude: number[] } {
    const out: { include: number[]; exclude: number[] } = { include: [], exclude: [] };
    for (const row of rows ?? []) {
        const id = Number(row[key]);
        if (!Number.isFinite(id)) continue;
        if (row.mode === "include") out.include.push(id);
        else out.exclude.push(id);
    }
    return out;
}

/**
 * SDK `AdminCoupon` → admin view `AdminCoupon`. Folds translations into a `{ fa, en }` pair,
 * splits each constraint set into `{ include, exclude }` buckets that match the editor's tab
 * UI, and reads the sidecar count fields the list endpoint attaches via
 * `CouponTransformer.setStats`.
 */
export function toAdminCoupon(c: SdkAdminCoupon): AdminCoupon {
    const description = (c.translations ?? []).reduce<{ fa?: string; en?: string }>((acc, t) => {
        if (t.locale === "fa") acc.fa = t.description ?? "";
        if (t.locale === "en") acc.en = t.description ?? "";
        return acc;
    }, {});
    /** `description_fa` / `description_en` are the list-view's pre-resolved translations. */
    const listFa = (c as unknown as { description_fa?: string | null }).description_fa ?? null;
    const listEn = (c as unknown as { description_en?: string | null }).description_en ?? null;
    return {
        id: c.id,
        code: c.code,
        discountType: c.discount_type,
        amountMinor: c.amount_minor === null || c.amount_minor === undefined ? null : (Number(c.amount_minor) as MoneyMinor),
        amountPercent: c.amount_percent ?? null,
        description: {
            fa: description.fa ?? listFa ?? "",
            en: description.en ?? listEn ?? description.fa ?? "",
        },
        startsAt: c.starts_at ?? null,
        expiresAt: c.expires_at ?? null,
        individualUse: Boolean(c.individual_use),
        excludeSaleItems: Boolean(c.exclude_sale_items),
        minimumAmount:
            c.minimum_amount === null || c.minimum_amount === undefined ? null : (Number(c.minimum_amount) as MoneyMinor),
        maximumAmount:
            c.maximum_amount === null || c.maximum_amount === undefined ? null : (Number(c.maximum_amount) as MoneyMinor),
        usageLimitGlobal: c.usage_limit_global ?? null,
        usageLimitPerUser: c.usage_limit_per_user ?? null,
        limitUsageToXItems: c.limit_usage_to_x_items ?? null,
        freeShipping: Boolean(c.free_shipping),
        status: c.status === "active" ? "active" : "disabled",
        usageCount: Number((c as unknown as { redemptions_count?: number }).redemptions_count ?? 0),
        recentRedemptions7d: Number((c as unknown as { recent_redemptions_7d?: number }).recent_redemptions_7d ?? 0),
        productConstraints: bucket(c.product_constraints, "product_id" as never),
        categoryConstraints: bucket(c.category_constraints, "category_id" as never),
        brandConstraints: bucket((c as unknown as { brand_constraints?: { brand_id: number; mode: "include" | "exclude" }[] }).brand_constraints, "brand_id" as never),
        emailRestrictions: c.email_restrictions ?? [],
        productConstraintsCount: Number(
            (c as unknown as { product_constraints_count?: number }).product_constraints_count ?? c.product_constraints?.length ?? 0,
        ),
        categoryConstraintsCount: Number(
            (c as unknown as { category_constraints_count?: number }).category_constraints_count ??
                c.category_constraints?.length ??
                0,
        ),
        brandConstraintsCount: Number(
            (c as unknown as { brand_constraints_count?: number }).brand_constraints_count ?? 0,
        ),
        emailRestrictionsCount: Number(
            (c as unknown as { email_restrictions_count?: number }).email_restrictions_count ??
                c.email_restrictions?.length ??
                0,
        ),
        deletedAt: c.deleted_at ?? null,
    };
}
